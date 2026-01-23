"""
Empik Tools Module
Contains: PriceMonitor, AiGenerator, ImageValidator
"""
import requests
import logging
from typing import List
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from PIL import Image


class PriceMonitor:
    """
    Monitor cen i Buy Box na Empik.com
    """
    
    HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
    }

    @classmethod
    def check_prices(cls, eans: List[str], my_shop_name: str = None) -> List[dict]:
        results = []
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = {executor.submit(cls.check_single_ean, ean, my_shop_name): ean for ean in eans}
            for future in futures:
                try:
                    results.append(future.result())
                except Exception as e:
                    logging.error(f"Error checking price: {e}")
                    results.append({
                        "ean": futures[future],
                        "status": "error",
                        "error": str(e)
                    })
        return results

    @classmethod
    def check_single_ean(cls, ean: str, my_shop_name: str = None) -> dict:
        url = f"https://www.empik.com/szukaj/produkt?q={ean}"
        try:
            # 1. Search for product
            res = requests.get(url, headers=cls.HEADERS, timeout=10)
            if res.status_code != 200:
                return {"ean": ean, "status": "error", "error": f"HTTP {res.status_code}"}
            
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(res.text, 'lxml')
            
            # Check if redirected to product page or list
            product_link = None
            if "p-desktop-cover" in res.text:
                product_link = res.url
            else:
                link_tag = soup.select_one('.search-list-item-hover a')
                if link_tag:
                    href = link_tag.get('href', '')
                    product_link = "https://www.empik.com" + href if href.startswith('/') else href
            
            if not product_link:
                return {"ean": ean, "status": "not_found", "error": "Product not found"}

            # 2. Get product details
            if product_link != res.url:
                res = requests.get(product_link, headers=cls.HEADERS, timeout=10)
                soup = BeautifulSoup(res.text, 'lxml')

            # Extract Title
            title_tag = soup.select_one('h1')
            title = title_tag.get_text(strip=True) if title_tag else "Unknown"

            # Extract Price
            price_tag = soup.select_one('.productPrice, [class*="price"]')
            price = "0.00"
            if price_tag:
                price_text = price_tag.get_text(strip=True)
                price = ''.join(c for c in price_text if c.isdigit() or c in '.,')
                price = price.replace(',', '.')

            # Extract Seller Name
            seller_tag = soup.select_one('[class*="seller"] a, .seller-name a')
            seller = seller_tag.get_text(strip=True) if seller_tag else "Empik"

            # Determine Status
            status = "neutral"
            if my_shop_name:
                if my_shop_name.lower() in seller.lower():
                    status = "winning"
                else:
                    status = "losing"
            
            return {
                "ean": ean,
                "title": title[:100],
                "price": price,
                "seller": seller,
                "url": product_link,
                "status": status,
                "timestamp": datetime.now().isoformat()
            }

        except Exception as e:
            return {"ean": ean, "status": "error", "error": str(e)}


class AiGenerator:
    """
    Generator opisow HTML zgodnych z wymogami Empik.
    Uzywa szabonow (Smart Templates) zamiast LLM (na razie).
    """

    @staticmethod
    def generate_description(data: dict) -> str:
        name = data.get('name', 'Produkt')
        features = data.get('features', [])
        specs = data.get('specs', {})
        
        # Clean features
        features = [f.strip() for f in features if f and f.strip()]
        
        # Build HTML
        html = f"""<section class="section">
<div class="item item-12">
<section class="text-item">
<h1>{name}</h1>
</section>
</div>
</section>
"""

        # Features Section
        if features:
            html += """<section class="section">
<div class="item item-12">
<section class="text-item">
<h2>Najwazniejsze cechy</h2>
<ul>
"""
            for feature in features:
                html += f"<li>{feature}</li>\n"
            html += """</ul>
</section>
</div>
</section>
"""

        # Specs Section
        if specs:
            html += """<section class="section">
<div class="item item-12">
<section class="text-item">
<h2>Specyfikacja techniczna</h2>
<table>
<tbody>
"""
            for key, value in specs.items():
                if key and value and str(key).strip() and str(value).strip():
                    html += f"<tr><td><strong>{key}</strong></td><td>{value}</td></tr>\n"
            html += """</tbody>
</table>
</section>
</div>
</section>
"""

        return html


class ImageValidator:
    """
    Walidacja obrazow pod katem wymogow Empik (biale tlo).
    """

    @staticmethod
    def check_white_background(image_path: str, tolerance: int = 10) -> dict:
        try:
            with Image.open(image_path) as img:
                img = img.convert("RGB")
                width, height = img.size
                
                # Check corners (should be white)
                corners = [
                    img.getpixel((0, 0)),
                    img.getpixel((width-1, 0)),
                    img.getpixel((0, height-1)),
                    img.getpixel((width-1, height-1))
                ]
                
                non_white_corners = 0
                for c in corners:
                    if any(x < (255 - tolerance) for x in c):
                        non_white_corners += 1
                
                # Check edges average
                edge_pixels = []
                step_w = max(1, width // 100)
                step_h = max(1, height // 100)
                
                for i in range(0, width, step_w):
                    edge_pixels.append(img.getpixel((i, 0)))
                    edge_pixels.append(img.getpixel((i, height-1)))
                for i in range(0, height, step_h):
                    edge_pixels.append(img.getpixel((0, i)))
                    edge_pixels.append(img.getpixel((width-1, i)))
                
                non_white_edges = 0
                for p in edge_pixels:
                    if any(x < (255 - tolerance) for x in p):
                        non_white_edges += 1
                
                edge_fail_ratio = non_white_edges / len(edge_pixels) if edge_pixels else 0
                
                is_valid = non_white_corners == 0 and edge_fail_ratio < 0.05
                
                return {
                    "is_valid": is_valid,
                    "non_white_corners": non_white_corners,
                    "edge_fail_ratio": round(edge_fail_ratio, 3),
                    "message": "OK" if is_valid else "Tlo nie jest biale (sprawdz rogi i krawedzie)"
                }
        except Exception as e:
            return {"is_valid": False, "message": f"Blad pliku: {str(e)}"}
