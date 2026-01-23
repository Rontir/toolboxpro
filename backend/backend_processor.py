import pandas as pd
import re
import os
import io
import shutil
import logging
from typing import Optional, Tuple, List, Dict
import warnings
from datetime import datetime
import zipfile
import requests
import threading
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse
import mimetypes
from pathlib import Path
from PIL import Image, ImageOps, ImageFilter, ImageStat

# Optional GUI imports (not available on server)
try:
    import tkinter as tk
    from tkinter import filedialog
    TKINTER_AVAILABLE = True
except ImportError:
    TKINTER_AVAILABLE = False

import json

warnings.filterwarnings('ignore')

# ═══════════════════════════════════════════════════════════════════════════
# SYSTEM UTILS
# ═══════════════════════════════════════════════════════════════════════════

class SystemUtils:
    @staticmethod
    def browse_folder() -> str:
        """Otwiera systemowe okno wyboru folderu"""
        if not TKINTER_AVAILABLE:
            raise RuntimeError("Funkcja browse_folder wymaga interfejsu graficznego (niedostępne na serwerze)")
        
        try:
            # Uruchom w nowym procesie/wątku GUI
            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            
            folder_path = filedialog.askdirectory(title="Wybierz folder")
            
            root.destroy()
            return folder_path if folder_path else ""
        except Exception as e:
            logging.error(f"Błąd wyboru folderu: {e}")
            return ""

# ═══════════════════════════════════════════════════════════════════════════
# EAN CHECKER MODULE
# ═══════════════════════════════════════════════════════════════════════════

class EanChecker:
    @staticmethod
    def waliduj_ean14(ean: str) -> bool:
        if len(ean) != 14: return False
        try:
            digits = [int(d) for d in ean]
        except ValueError:
            return False
        checksum = digits[-1]
        weighted_sum = sum(digits[i] * (3 if i % 2 == 0 else 1) for i in range(13))
        calculated_check = (10 - (weighted_sum % 10)) % 10
        return calculated_check == checksum

    @staticmethod
    def waliduj_ean13(ean: str) -> bool:
        if len(ean) != 13: return False
        try:
            digits = [int(d) for d in ean]
        except ValueError:
            return False
        checksum = digits[-1]
        weighted_sum = sum(digits[i] * (1 if i % 2 == 0 else 3) for i in range(12))
        calculated_check = (10 - (weighted_sum % 10)) % 10
        return calculated_check == checksum

    @staticmethod
    def waliduj_ean8(ean: str) -> bool:
        if len(ean) != 8: return False
        try:
            digits = [int(d) for d in ean]
        except ValueError:
            return False
        checksum = digits[-1]
        weighted_sum = sum(digits[i] * (3 if i % 2 == 0 else 1) for i in range(7))
        calculated_check = (10 - (weighted_sum % 10)) % 10
        return calculated_check == checksum

    @classmethod
    def znajdz_wszystkie_eany(cls, text: str) -> List[str]:
        if not isinstance(text, str):
            return []

        link_regex = re.compile(r'(https?://[^\s]+|www\.[^\s]+)', re.IGNORECASE)
        clean_text = re.sub(link_regex, ' ', text)

        ean_regex = re.compile(r'\b(\d{14})\b|\b(\d{13})\b|\b(\d{8})\b')
        matches = ean_regex.findall(clean_text)
        
        potencjalne_eany = set()
        for match in matches:
            for group in match:
                if group:
                    potencjalne_eany.add(group)
        
        poprawne_eany = []
        for ean in potencjalne_eany:
            dlugosc = len(ean)
            isValid = False
            
            if dlugosc == 14: isValid = cls.waliduj_ean14(ean)
            elif dlugosc == 13: isValid = cls.waliduj_ean13(ean)
            elif dlugosc == 8: isValid = cls.waliduj_ean8(ean)
                
            if isValid:
                poprawne_eany.append(ean)
                
        return poprawne_eany

    @staticmethod
    def kategoryzuj_blad(row, kolumna_glownego_ean) -> str:
        znalezione_eany_lista = row['ZNALEZIONE_EAN']
        if not znalezione_eany_lista:
            return 'OK'

        glowne_eany_str = str(row[kolumna_glownego_ean]).strip()
        glowne_eany_list_raw = glowne_eany_str.split(';')
        
        glowne_eany_normalized_set = {
            ean.strip().lstrip('0') 
            for ean in glowne_eany_list_raw 
            if ean.strip() and ean.strip().lower() != 'nan'
        }

        if not glowne_eany_normalized_set:
            return f'KRYTYCZNY: Znaleziono EAN w opisie, brak EAN w kolumnie EAN ({", ".join(znalezione_eany_lista)})'

        bledne_eany = []
        for ean_znaleziony in znalezione_eany_lista:
            ean_znaleziony_normalized = ean_znaleziony.lstrip('0')
            if ean_znaleziony_normalized not in glowne_eany_normalized_set:
                bledne_eany.append(ean_znaleziony)

        if bledne_eany:
            return f'KRYTYCZNY: Znaleziono EAN niepasujący do kolumny EAN ({", ".join(bledne_eany)})'
        
        return 'OK'

    @staticmethod
    def okresl_typ_wiersza(row, col_found, col_main):
        wszystkie_eany = []
        if isinstance(row[col_found], list):
            wszystkie_eany.extend(row[col_found])
        
        main_val = str(row[col_main])
        if main_val and main_val.lower() != 'nan':
            wszystkie_eany.extend([x.strip() for x in main_val.split(';')])
            
        ma_ean_8 = False
        
        for ean in wszystkie_eany:
            ean_clean = re.sub(r'\D', '', ean)
            ean_norm = ean_clean.lstrip('0')
            dlugosc = len(ean_norm)
            
            if dlugosc <= 8 and dlugosc > 6: 
                ma_ean_8 = True
                
        return 'EAN_8' if ma_ean_8 else 'EAN_13_14'

    @classmethod
    def process(cls, file_content: bytes, col_search: List[str], col_main: str) -> io.BytesIO:
        df = pd.read_excel(io.BytesIO(file_content), dtype=str)
        
        # Validate columns
        missing = [c for c in col_search + [col_main] if c not in df.columns]
        if missing:
            raise ValueError(f"Brakujące kolumny: {', '.join(missing)}")

        df[col_main] = df[col_main].fillna('')
        df['__TEKST_DO_SZUKANIA__'] = df[col_search].fillna('').astype(str).apply(' '.join, axis=1)

        # Scan
        df['ZNALEZIONE_EAN_LISTA'] = df['__TEKST_DO_SZUKANIA__'].apply(cls.znajdz_wszystkie_eany)
        
        # Validate
        df['ZNALEZIONE_EAN'] = df['ZNALEZIONE_EAN_LISTA']
        df['WALIDACJA_EAN'] = df.apply(cls.kategoryzuj_blad, axis=1, kolumna_glownego_ean=col_main)
        df['TYP_ARKUSZA'] = df.apply(cls.okresl_typ_wiersza, axis=1, col_found='ZNALEZIONE_EAN', col_main=col_main)

        # Cleanup
        df = df.drop(columns=['__TEKST_DO_SZUKANIA__', 'ZNALEZIONE_EAN_LISTA'])
        df['ZNALEZIONE_EAN'] = df['ZNALEZIONE_EAN'].apply(lambda x: ', '.join(x) if isinstance(x, list) else '')

        # Split
        df_ean8 = df[df['TYP_ARKUSZA'] == 'EAN_8'].drop(columns=['TYP_ARKUSZA'])
        df_ean13_14 = df[df['TYP_ARKUSZA'] == 'EAN_13_14'].drop(columns=['TYP_ARKUSZA'])
        df_full = df.drop(columns=['TYP_ARKUSZA'])

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df_full.to_excel(writer, sheet_name='Raport_Pelny', index=False)
            df_ean13_14.to_excel(writer, sheet_name='EAN_13_i_14', index=False)
            df_ean8.to_excel(writer, sheet_name='EAN_8', index=False)
            
        output.seek(0)
        return output

# ═══════════════════════════════════════════════════════════════════════════
# STRUCTURE MATCHER MODULE
# ═══════════════════════════════════════════════════════════════════════════

class StructureMatcher:
    @staticmethod
    def normalize_path(path):
        if pd.isna(path): return ""
        path = str(path).lower()
        path = path.replace('"', '').replace("'", '').replace(' ', '')
        path = path.replace('>', '/')
        path = re.sub(r'/+', '/', path)
        return path.strip('/')

    @classmethod
    def process(cls, batch_file: bytes, base_file: bytes, path_col_idx: int) -> io.BytesIO:
        # Load batch
        try:
            df_batch = pd.read_excel(io.BytesIO(batch_file))
        except:
            df_batch = pd.read_csv(io.BytesIO(batch_file), encoding='utf-8')

        if path_col_idx < 0 or path_col_idx >= len(df_batch.columns):
            raise ValueError(f"Nieprawidłowy indeks kolumny: {path_col_idx}")
            
        path_column = df_batch.columns[path_col_idx]

        # Load base
        df_base = None
        for enc in ['utf-8', 'cp1250', 'latin1', 'iso-8859-2']:
            try:
                df_base = pd.read_csv(io.BytesIO(base_file), sep='|', encoding=enc, quoting=3, on_bad_lines='skip')
                df_base.columns = df_base.columns.str.strip()
                break
            except:
                continue
        
        if df_base is None:
            raise ValueError("Nie udało się wczytać pliku bazowego")

        # Normalize headers if needed
        if len(df_base.columns) >= 2 and 'KOD' not in df_base.columns:
            df_base.columns = ['KOD', 'ŚCIEŻKA'] + list(df_base.columns[2:])

        # Normalize paths
        df_base['_klucz'] = df_base['ŚCIEŻKA'].apply(cls.normalize_path)
        df_batch['_klucz'] = df_batch[path_column].apply(cls.normalize_path)

        # Merge
        df_result = df_batch.merge(df_base[['KOD', '_klucz']], on='_klucz', how='left')
        df_result = df_result.drop('_klucz', axis=1)

        # Reorder
        cols = ['KOD'] + [col for col in df_result.columns if col != 'KOD']
        df_result = df_result[cols]

        output = io.BytesIO()
        df_result.to_excel(output, index=False)
        output.seek(0)
        return output

# ═══════════════════════════════════════════════════════════════════════════
# PIKO EMPIKO MODULE (Downloader)
# ═══════════════════════════════════════════════════════════════════════════

class PikoEmpiko:
    @staticmethod
    def convert_cloud_link(url: str) -> str:
        if not url or not isinstance(url, str): return url
        url = url.strip()
        
        # Google Drive
        if 'drive.google.com' in url:
            patterns = [
                r'drive\.google\.com/file/d/([a-zA-Z0-9_-]+)',
                r'drive\.google\.com/open\?id=([a-zA-Z0-9_-]+)',
            ]
            for pattern in patterns:
                match = re.search(pattern, url)
                if match:
                    return f"https://drive.google.com/uc?export=download&id={match.group(1)}"
        
        # Dropbox
        if 'dropbox.com' in url:
            if '?dl=0' in url: return url.replace('?dl=0', '?dl=1')
            if '?' not in url: return url + '?dl=1'
            return url + '&dl=1'
            
        # Imgur
        if 'imgur.com' in url and not url.startswith('https://i.imgur.com'):
            match = re.search(r'imgur\.com/([a-zA-Z0-9]+)', url)
            if match: return f"https://i.imgur.com/{match.group(1)}.jpg"

        return url

    @staticmethod
    def download_file(url: str, session: requests.Session) -> tuple:
        """Returns (data, error_message). data is bytes if success, None if failed."""
        try:
            if not url or not isinstance(url, str):
                return (None, "Brak URL")
            url = url.strip()
            if not url.startswith('http'):
                return (None, "Nieprawidłowy URL")
                
            url = PikoEmpiko.convert_cloud_link(url)
            logging.info(f"📥 Downloading: {url[:80]}...")
            
            with session.get(url, timeout=15, stream=True, allow_redirects=True) as r:
                logging.info(f"   Status: {r.status_code}, Content-Type: {r.headers.get('Content-Type', 'unknown')}")
                if r.status_code == 200:
                    content = r.content
                    if len(content) > 100:  # Min size check
                        logging.info(f"   ✅ Downloaded {len(content)} bytes")
                        return (content, None)
                    else:
                        logging.warning(f"   ⚠️ Too small: {len(content)} bytes")
                        return (None, f"Plik za mały ({len(content)} B)")
                else:
                    logging.warning(f"   ❌ HTTP {r.status_code}")
                    return (None, f"HTTP {r.status_code}")
        except requests.exceptions.Timeout:
            logging.error(f"   ❌ Timeout: {url[:50]}")
            return (None, "Timeout")
        except requests.exceptions.ConnectionError:
            logging.error(f"   ❌ Connection error: {url[:50]}")
            return (None, "Błąd połączenia")
        except Exception as e:
            logging.error(f"   ❌ Error downloading {url[:50]}: {str(e)[:50]}")
            return (None, f"Błąd: {str(e)[:30]}")
        return (None, "Nieznany błąd")

    @classmethod
    def process(cls, file_content: bytes, col_index: str, col_main: str, col_extra: str) -> io.BytesIO:
        df = pd.read_excel(io.BytesIO(file_content), dtype=str)
        
        # Create temp directory structure in memory (using ZipFile)
        output_zip = io.BytesIO()
        
        session = requests.Session()
        session.headers.update({"User-Agent": "Mozilla/5.0"})
        
        with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
            with ThreadPoolExecutor(max_workers=10) as executor:
                futures = []
                
                for idx, row in df.iterrows():
                    indeks = str(row.get(col_index, '')).strip()
                    if not indeks or indeks.lower() == 'nan': continue
                    
                    # Main photo
                    main_url = str(row.get(col_main, '')).strip()
                    if main_url and main_url.lower() != 'nan':
                        futures.append(executor.submit(cls._download_and_add, session, main_url, f"{indeks}.jpg", zipf))
                    
                    # Extra photos (simple logic: check columns starting with col_extra)
                    # Or if col_extra is a prefix, find all columns
                    extra_cols = [c for c in df.columns if str(c).startswith(col_extra)]
                    for i, col in enumerate(extra_cols):
                        url = str(row.get(col, '')).strip()
                        if url and url.lower() != 'nan':
                            futures.append(executor.submit(cls._download_and_add, session, url, f"{indeks}_{i+1}.jpg", zipf))
                
                # Wait for all
                for f in futures:
                    f.result()
                    
        output_zip.seek(0)
        return output_zip

    @classmethod
    def _download_and_add(cls, session, url, filename, zipf):
        # Note: ZipFile is not thread-safe for writing, so we need a lock if we write directly.
        # But here we are in a thread. Better to return result and write in main thread?
        # Or use a lock.
        content = cls.download_file(url, session)
        if content:
            # We need a lock for zipf.write
            # Since we can't easily pass a lock through submit without global or manager,
            # let's just use a simple lock on the class or assume sequential write is needed.
            # Actually, let's change logic: download first, then write.
            return (filename, content)
        return None

    # RE-IMPLEMENTING PROCESS TO BE THREAD-SAFE FOR ZIP - FULL VERSION
    @classmethod
    def process_safe(cls, file_content: bytes, col_index: str, col_main: str, col_extra: str, 
                     progress_callback=None, batch_size: int = 0, create_zip: bool = False,
                     compress_jpg: bool = False, convert_format: str = 'jpg',
                     max_resolution: int = 0, resume: bool = False,
                     pim_version: str = 'PIM3', job_id: str = None) -> str:
        """
        Full PikoEmpiko download with disk-based processing to avoid OOM.
        Returns path to the generated ZIP file.
        """
        from datetime import datetime
        import tempfile
        import uuid
        
        df = pd.read_excel(io.BytesIO(file_content), dtype=str)
        total_rows = len(df)
        processed_rows = 0
        
        session = requests.Session()
        session.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
        
        lock = threading.Lock()
        
        # Create temp directory for this job (using system temp for Render compatibility)
        base_temp = tempfile.gettempdir()
        job_temp_dir = os.path.join(base_temp, "piko_processing", job_id if job_id else str(uuid.uuid4()))
        os.makedirs(job_temp_dir, exist_ok=True)
        
        # Results tracking
        results = []
        downloaded_files = [] # List of filenames
        failed_downloads = []
        
        def process_row(row_data):
            nonlocal processed_rows
            idx, row = row_data
            indeks = str(row.get(col_index, '')).strip()
            
            if not indeks or indeks.lower() == 'nan': 
                with lock:
                    processed_rows += 1
                    if progress_callback: progress_callback(processed_rows, total_rows)
                return None
            
            result = {
                'Indeks MDM': indeks,
                'Zdjęcie okładki/produktu': '',
                'Dodatkowe zdjęcia': '',
                'Błędy': ''
            }
            errors = []
            
            # Helper to save file
            def save_image(url, filename):
                data, error_msg = cls.download_file(url, session)
                if data:
                    file_path = os.path.join(job_temp_dir, filename)
                    with open(file_path, "wb") as f:
                        f.write(data)
                    return True, None
                return False, error_msg

            # Main photo
            main_url = str(row.get(col_main, '')).strip()
            if main_url and main_url.lower() != 'nan':
                filename = f"{indeks}.jpg"
                success, error_msg = save_image(main_url, filename)
                if success:
                    result['Zdjęcie okładki/produktu'] = filename
                    with lock:
                        downloaded_files.append(filename)
                else:
                    errors.append(f"Główne: {error_msg}")
                    with lock:
                        failed_downloads.append((main_url, indeks, 'main', error_msg))

            # Extra photos
            extra_cols = [c for c in df.columns if str(c).startswith(col_extra)]
            extra_filenames = []
            for i, col in enumerate(extra_cols):
                url = str(row.get(col, '')).strip()
                if url and url.lower() != 'nan':
                    filename = f"{indeks}_{i+1}.jpg"
                    success, error_msg = save_image(url, filename)
                    if success:
                        extra_filenames.append(filename)
                        with lock:
                            downloaded_files.append(filename)
                    else:
                        errors.append(f"Dodatkowe {i+1}: {error_msg}")
                        with lock:
                            failed_downloads.append((url, indeks, 'extra', error_msg))
            
            result['Dodatkowe zdjęcia'] = ';'.join(extra_filenames)
            result['Błędy'] = '; '.join(errors) if errors else ''
            
            with lock:
                results.append(result)
                processed_rows += 1
                if progress_callback: progress_callback(processed_rows, total_rows)
            
            return result

        # Process rows SEQUENTIALLY to prevent OOM on Render (512MB limit)
        # ThreadPoolExecutor was causing memory spikes
        logging.info(f"Processing {total_rows} rows sequentially (OOM prevention)...")
        for row_data in df.iterrows():
            process_row(row_data)
        
        # Create result DataFrame
        df_result = pd.DataFrame(results)
        
        # Create output ZIP on disk (using system temp for Render compatibility)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_zip_path = os.path.join(base_temp, f"piko_result_{job_id}_{timestamp}.zip")
        
        # Calculate batch info
        total_products = len(df_result)
        
        with zipfile.ZipFile(output_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            
            # === BATCH SPLITTING LOGIC ===
            if batch_size > 0 and total_products > batch_size:
                num_batches = (total_products + batch_size - 1) // batch_size
                logging.info(f"📦 Dzielenie na {num_batches} paczek po {batch_size} produktów")
                
                for batch_num in range(num_batches):
                    start_idx = batch_num * batch_size
                    end_idx = min((batch_num + 1) * batch_size, total_products)
                    
                    batch_name = f"paczka_{batch_num + 1}_of_{num_batches}"
                    df_batch = df_result.iloc[start_idx:end_idx].copy()
                    
                    # Get files for this batch
                    batch_indices = set(df_batch['Indeks MDM'].tolist())
                    batch_files = [fn for fn in downloaded_files 
                                   if fn.split('.')[0].split('_')[0] in batch_indices]
                    
                    if create_zip:
                        # Create separate ZIP for each batch
                        batch_zip_path = os.path.join(job_temp_dir, f"{batch_name}.zip")
                        with zipfile.ZipFile(batch_zip_path, 'w', zipfile.ZIP_DEFLATED) as bzipf:
                            for filename in batch_files:
                                file_path = os.path.join(job_temp_dir, filename)
                                if os.path.exists(file_path):
                                    bzipf.write(file_path, filename)
                        
                        zipf.write(batch_zip_path, f"{batch_name}.zip")
                    else:
                        # Add files to folder in main ZIP
                        for filename in batch_files:
                            file_path = os.path.join(job_temp_dir, filename)
                            if os.path.exists(file_path):
                                zipf.write(file_path, f"{batch_name}/{filename}")
                    
                    # Create batch Excel
                    batch_excel = io.BytesIO()
                    with pd.ExcelWriter(batch_excel, engine='openpyxl') as writer:
                        df_batch_success = df_batch[df_batch['Błędy'].fillna('') == ''].copy()
                        if pim_version == 'PIM4':
                            df_batch_success.insert(0, 'Typ', 'singiel')
                        df_batch_success.to_excel(writer, index=False, sheet_name='Wynik')
                        
                        batch_errors = [e for e in failed_downloads if e[1] in batch_indices]
                        if batch_errors:
                            df_batch_errors = pd.DataFrame([{
                                'Indeks MDM': idx,
                                'Typ zdjęcia': 'Główne' if typ == 'main' else 'Dodatkowe',
                                'URL': url,
                                'Błąd': error_code
                            } for url, idx, typ, error_code in batch_errors])
                            df_batch_errors.to_excel(writer, index=False, sheet_name='❌ Błędy')
                    
                    batch_excel.seek(0)
                    zipf.writestr(f"wynik_{batch_name}.xlsx", batch_excel.read())
                    
                    logging.info(f"  ✅ Paczka {batch_num + 1}: {len(df_batch)} produktów, {len(batch_files)} zdjęć")
            else:
                # No batching - add all files to root
                for filename in downloaded_files:
                    file_path = os.path.join(job_temp_dir, filename)
                    if os.path.exists(file_path):
                        zipf.write(file_path, filename)
            
            # === MAIN RESULT EXCEL ===
            excel_buffer = io.BytesIO()
            with pd.ExcelWriter(excel_buffer, engine='openpyxl') as writer:
                df_success = df_result[df_result['Błędy'].fillna('') == ''].copy()
                if pim_version == 'PIM4':
                    df_success.insert(0, 'Typ', 'singiel')
                    logging.info("📋 Format PIM4: dodano kolumnę 'Typ' z wartością 'singiel'")
                
                df_success.to_excel(writer, index=False, sheet_name='Wynik')
                
                df_all = df_result.copy()
                if pim_version == 'PIM4':
                    df_all.insert(0, 'Typ', 'singiel')
                df_all.to_excel(writer, index=False, sheet_name='Wszystkie')
                
                # Summary
                success_count = len(df_success)
                failed_count = len(df_result) - success_count
                total_photos = len(downloaded_files)
                
                summary_data = pd.DataFrame([{
                    '📊 Razem produktów': total_rows,
                    '✅ Pobrane pomyślnie': success_count,
                    '❌ Z błędami': failed_count,
                    '🖼️ Zdjęć pobranych': total_photos,
                    '📦 Liczba paczek': (total_products + batch_size - 1) // batch_size if batch_size > 0 else 1,
                    '% Sukcesu': f"{(success_count/total_rows*100) if total_rows else 0:.1f}%"
                }])
                summary_data.to_excel(writer, index=False, sheet_name='Podsumowanie')

            excel_buffer.seek(0)
            zipf.writestr("RAPORT_CALOSCIOWY.xlsx", excel_buffer.read())

        # Cleanup temp dir
        try:
            shutil.rmtree(job_temp_dir)
        except Exception as e:
            logging.error(f"Failed to cleanup temp dir {job_temp_dir}: {e}")
            
        return output_zip_path

class PikoEmpikoLocal:
    """
    Obsługa lokalnych operacji na plikach (Tryby 2-7).
    Wymaga dostępu do lokalnego systemu plików serwera.
    """
    
    DOZWOLONE_ROZSZERZENIA = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

    @classmethod
    def process_request(cls, mode: int, folder_path: str, excel_content: Optional[bytes] = None, options: dict = None, progress_callback=None) -> dict:
        folder = Path(folder_path)
        if not folder.exists() or not folder.is_dir():
            return {"status": "error", "message": "Podany folder nie istnieje"}

        opts = options or {}
        
        try:
            if mode == 2:
                return cls.mode_2_folder_to_excel(folder, progress_callback)
            elif mode == 3:
                return cls.mode_3_fix_names(folder, opts, progress_callback)
            elif mode == 4:
                return cls.mode_4_folder_as_index(folder, opts, progress_callback)
            elif mode == 5:
                return cls.mode_5_mass_subfolders(folder, opts, progress_callback)
            elif mode == 6:
                if not excel_content:
                    return {"status": "error", "message": "Wymagany plik Excel dla trybu 6"}
                return cls.mode_6_batch_rename(folder, excel_content, opts, progress_callback)
            elif mode == 7:
                if not excel_content:
                    return {"status": "error", "message": "Wymagany plik Excel dla trybu 7"}
                return cls.mode_7_intelligent(folder, excel_content, opts, progress_callback)
            else:
                return {"status": "error", "message": "Nieznany tryb"}
        except Exception as e:
            logging.error(f"Błąd w trybie {mode}: {e}")
            return {"status": "error", "message": str(e)}

    @classmethod
    def mode_2_folder_to_excel(cls, folder: Path, progress_callback=None) -> dict:
        """Tryb 2: Generuje raport Excel z zawartości folderu w formacie PIM"""
        files = [p for p in folder.rglob('*') if p.is_file() and p.suffix.lower() in cls.DOZWOLONE_ROZSZERZENIA]
        total = len(files)
        groups = {}

        for i, p in enumerate(files):
            if progress_callback: 
                progress_callback(int((i / max(total, 1)) * 100))
            
            # Match files like: 1544963734.jpg or 1544963734_1.jpg
            m = re.match(r"^(\d+)(?:_(\d+))?$", p.stem)
            if not m: 
                continue
            idx, suf = m.group(1), m.group(2)
            groups.setdefault(idx, {"main": [], "extra": []})
            if suf is None:
                groups[idx]["main"].append(p.name)
            else:
                groups[idx]["extra"].append(p.name)

        rows = []
        for idx, data in groups.items():
            main = sorted(data["main"])[0] if data["main"] else ""
            extras = sorted(data["extra"], key=lambda x: int(re.search(r"_(\d+)", x).group(1)) if re.search(r"_(\d+)", x) else 0)
            rows.append([idx, main, ";".join(extras)])

        df = pd.DataFrame(rows, columns=["Indeks MDM", "Zdjęcie okładki/produktu", "Dodatkowe zdjęcia"])
        output_path = folder / f"raport_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        df.to_excel(output_path, index=False)
        
        if progress_callback:
            progress_callback(100)
        
        return {"status": "success", "message": f"Utworzono raport: {output_path.name} ({len(rows)} produktów)", "file": str(output_path)}

    @classmethod
    def mode_3_fix_names(cls, folder: Path, opts: dict, progress_callback=None) -> dict:
        """Tryb 3: Naprawia nazwy plików (12345 (1).jpg -> 12345_1.jpg) i generuje raport"""
        files = [p for p in folder.rglob('*') if p.is_file() and p.suffix.lower() in cls.DOZWOLONE_ROZSZERZENIA]
        total = len(files) or 1
        groups = {}

        # Grupuj po indeksie
        for i, p in enumerate(files):
            if progress_callback:
                progress_callback(int((i / total) * 50))
            m = re.match(r"^(\d+)", p.stem)
            if not m:
                continue
            idx = m.group(1)
            groups.setdefault(idx, []).append(p)

        rows = []
        group_items = list(groups.items())
        
        for g_idx, (idx, lst) in enumerate(group_items):
            if progress_callback:
                progress_callback(50 + int((g_idx / max(len(group_items), 1)) * 50))
            
            # Sortuj: główne zdjęcie pierwsze, potem po numerze
            def key_nr(p):
                s = p.stem
                if s == idx:
                    return -1
                m1 = re.search(r"\((\d+)\)$", s)
                if m1:
                    return int(m1.group(1))
                m2 = re.search(r"_(\d+)$", s)
                if m2:
                    return int(m2.group(1))
                return 0

            sorted_list = sorted(lst, key=key_nr)
            if not sorted_list:
                rows.append([idx, "", "", "brak"])
                continue

            # Rename files
            main_dst = folder / f"{idx}.jpg"
            extras_names = []
            err_msg = ""

            for i, src in enumerate(sorted_list):
                if i == 0:
                    dst = main_dst
                else:
                    dst = folder / f"{idx}_{i}.jpg"
                    extras_names.append(dst.name)

                if src.resolve() != dst.resolve():
                    try:
                        if dst.exists():
                            dst.unlink()
                        shutil.move(str(src), str(dst))
                    except Exception as e:
                        err_msg += f"Error; "

            rows.append([idx, main_dst.name, ";".join(extras_names), err_msg])

        # Zapisz Excel
        df = pd.DataFrame(rows, columns=["Indeks MDM", "Zdjęcie okładki/produktu", "Dodatkowe zdjęcia", "Błędy"])
        output_path = folder / f"wynik_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        df.to_excel(output_path, index=False)
        
        if progress_callback:
            progress_callback(100)
        
        return {"status": "success", "message": f"Naprawiono nazwy, raport: {output_path.name} ({len(rows)} produktów)", "file": str(output_path)}

    @classmethod
    def mode_4_folder_as_index(cls, folder: Path, opts: dict, progress_callback=None) -> dict:
        """Tryb 4: Zmienia nazwy plików na podstawie nazwy folderu (EAN) i generuje raport"""
        folder_name = folder.name.strip()
        indeks = re.sub(r'[^0-9A-Za-z]', '', folder_name) or folder_name
        
        files = [p for p in folder.glob('*') if p.is_file() and p.suffix.lower() in cls.DOZWOLONE_ROZSZERZENIA]
        files.sort(key=lambda p: p.stat().st_size, reverse=True)
        
        if not files:
            df = pd.DataFrame([[indeks, "", "", "brak zdjęć"]], 
                            columns=["Indeks MDM", "Zdjęcie okładki/produktu", "Dodatkowe zdjęcia", "Błędy"])
            output_path = folder / f"wynik_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            df.to_excel(output_path, index=False)
            return {"status": "success", "message": "Brak zdjęć w folderze", "file": str(output_path)}
        
        main_dst_name = None
        extras_names = []
        err_msg = ""
        
        for idx, src in enumerate(files):
            if progress_callback:
                progress_callback(int((idx / len(files)) * 100))
            
            if idx == 0:
                dst = folder / f"{indeks}.jpg"
                main_dst_name = dst.name
            else:
                dst = folder / f"{indeks}_{idx}.jpg"
                extras_names.append(dst.name)
            
            if src.resolve() != dst.resolve():
                try:
                    if dst.exists():
                        dst.unlink()
                    shutil.move(str(src), str(dst))
                except Exception as e:
                    err_msg += f"Error; "
        
        # Zapisz Excel
        df = pd.DataFrame([[indeks, main_dst_name, ";".join(extras_names), err_msg]], 
                         columns=["Indeks MDM", "Zdjęcie okładki/produktu", "Dodatkowe zdjęcia", "Błędy"])
        output_path = folder / f"wynik_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        df.to_excel(output_path, index=False)
        
        if progress_callback:
            progress_callback(100)
        
        return {"status": "success", "message": f"Zmieniono na indeks '{indeks}', raport: {output_path.name}", "file": str(output_path)}

    @classmethod
    def mode_5_mass_subfolders(cls, folder: Path, opts: dict, progress_callback=None) -> dict:
        """Tryb 5: Masowe przetwarzanie podfolderów i generuje raport"""
        output_folder = folder / "wynik_masowy"
        output_folder.mkdir(exist_ok=True)
        
        subfolders = [p for p in folder.iterdir() if p.is_dir() and p != output_folder]
        
        if not subfolders:
            return {"status": "error", "message": "Brak podfolderów w wybranym folderze"}
        
        rows = []
        total = len(subfolders)
        
        for folder_idx, sub in enumerate(subfolders):
            if progress_callback:
                progress_callback(int((folder_idx / total) * 100))
            
            # Znajdź EANy w nazwie folderu
            eans = re.findall(r'\b\d{8,}\b', sub.name)
            if not eans:
                indeks = re.sub(r'[^0-9A-Za-z]', '', sub.name).strip() or sub.name
                eans = [indeks]
            
            # Usuń duplikaty
            eans = list(dict.fromkeys(eans))
            
            files = [p for p in sub.glob('*') if p.is_file() and p.suffix.lower() in cls.DOZWOLONE_ROZSZERZENIA]
            files.sort(key=lambda p: p.stat().st_size, reverse=True)
            
            if not files:
                for ean in eans:
                    rows.append([ean, "", "", "brak zdjęć w podfolderze"])
                continue
            
            # Dla każdego EAN-a kopiuj te same zdjęcia
            for ean in eans:
                main_dst_name = None
                extras_names = []
                err_msg = ""
                
                for idx, src in enumerate(files):
                    if idx == 0:
                        dst = output_folder / f"{ean}.jpg"
                        main_dst_name = dst.name
                    else:
                        dst = output_folder / f"{ean}_{idx}.jpg"
                        extras_names.append(dst.name)
                    
                    try:
                        if dst.exists():
                            dst.unlink()
                        shutil.copy2(str(src), str(dst))
                    except Exception as e:
                        err_msg += f"Error copying {src.name}; "
                
                rows.append([ean, main_dst_name, ";".join(extras_names), err_msg])
        
        # Zapisz Excel
        df = pd.DataFrame(rows, columns=["Indeks MDM", "Zdjęcie okładki/produktu", "Dodatkowe zdjęcia", "Błędy"])
        output_path = output_folder / f"wynik_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        df.to_excel(output_path, index=False)
        
        if progress_callback:
            progress_callback(100)
        
        return {"status": "success", "message": f"Przetworzono {total} podfolderów, raport: {output_path.name} ({len(rows)} produktów)", "file": str(output_path)}

    @classmethod
    def mode_6_batch_rename(cls, folder: Path, excel_content: bytes, opts: dict, progress_callback=None) -> dict:
        """Tryb 6: Batch Rename wg Excela z raportem"""
        df = pd.read_excel(io.BytesIO(excel_content))
        df.columns = [str(c).strip() for c in df.columns]
        
        # Auto-detekcja kolumn
        source_col = next((c for c in df.columns if 'id' in c.lower() or 'lego' in c.lower()), df.columns[0])
        target_col = next((c for c in df.columns if any(x in c.lower() for x in ['ean', 'mdm', 'gold', 'indeks']) and c != source_col), None)
        
        if not target_col:
            return {"status": "error", "message": "Nie znaleziono kolumny docelowej (EAN/MDM/GOLD)"}
            
        files = [p for p in folder.rglob('*') if p.is_file() and p.suffix.lower() in cls.DOZWOLONE_ROZSZERZENIA]
        rows = []
        total = len(df)
        
        for row_idx, row in df.iterrows():
            if progress_callback:
                progress_callback(int((row_idx / max(total, 1)) * 100))
            
            sid = str(row[source_col]).strip()
            tid = str(row[target_col]).strip()
            if not sid or not tid or sid == 'nan' or tid == 'nan':
                continue
            
            # Znajdź pliki pasujące do SID
            matches = [f for f in files if sid in f.stem]
            matches.sort(key=lambda x: x.stat().st_size, reverse=True)
            
            if not matches:
                rows.append([tid, "", "", f"Nie znaleziono plików dla {sid}"])
                continue
            
            main_name = None
            extras_names = []
            err_msg = ""
            
            for idx, src in enumerate(matches):
                suffix = "" if idx == 0 else f"_{idx}"
                dst = src.parent / f"{tid}{suffix}{src.suffix}"
                
                if idx == 0:
                    main_name = dst.name
                else:
                    extras_names.append(dst.name)
                
                if src != dst:
                    try:
                        src.rename(dst)
                    except Exception as e:
                        err_msg += f"Error; "
            
            rows.append([tid, main_name, ";".join(extras_names), err_msg])
        
        # Zapisz Excel
        df_out = pd.DataFrame(rows, columns=["Indeks MDM", "Zdjęcie okładki/produktu", "Dodatkowe zdjęcia", "Błędy"])
        output_path = folder / f"wynik_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        df_out.to_excel(output_path, index=False)
        
        if progress_callback:
            progress_callback(100)
                    
        return {"status": "success", "message": f"Zmieniono nazwy, raport: {output_path.name} ({len(rows)} produktów)", "file": str(output_path)}

    @classmethod
    def mode_7_intelligent(cls, folder: Path, excel_content: bytes, opts: dict, progress_callback=None) -> dict:
        """Tryb 7: Inteligentny z kolumną akcji - generuje raport"""
        df = pd.read_excel(io.BytesIO(excel_content))
        df.columns = [str(c).strip() for c in df.columns]
        
        source_col = next((c for c in df.columns if 'id' in c.lower() or 'lego' in c.lower()), df.columns[0])
        target_col = next((c for c in df.columns if any(x in c.lower() for x in ['ean', 'mdm', 'gold']) and c != source_col), None)
        action_col = next((c for c in df.columns if any(x in c.lower() for x in ['akcja', 'action', 'typ', 'co do'])), None)
        
        if not target_col:
            return {"status": "error", "message": "Brak kolumny docelowej"}
            
        files = [p for p in folder.rglob('*') if p.is_file() and p.suffix.lower() in cls.DOZWOLONE_ROZSZERZENIA]
        rows = []
        
        # Grupuj po target_id
        grouped = {}
        for _, row in df.iterrows():
            tid = str(row[target_col]).strip()
            if tid and tid != 'nan':
                grouped.setdefault(tid, []).append(row)
        
        total = len(grouped)
        processed_idx = 0
        
        for tid, excel_rows in grouped.items():
            if progress_callback:
                progress_callback(int((processed_idx / max(total, 1)) * 100))
            processed_idx += 1
            
            main_name = None
            extras_names = []
            err_msg = ""
            
            for row in excel_rows:
                sid = str(row[source_col]).strip()
                action = str(row[action_col]).lower() if action_col else ""
                
                if "wideo" in action or "video" in action:
                    continue  # Skip video
                
                # Znajdź pliki dla tego SID
                matches = [f for f in files if sid in f.stem]
                if not matches:
                    err_msg += f"Nie znaleziono {sid}; "
                    continue
                
                matches.sort(key=lambda x: x.stat().st_size, reverse=True)
                is_main = "główne" in action or "main" in action or not action
                
                src = matches[0]  # Największy plik
                
                if is_main and main_name is None:
                    dst = src.parent / f"{tid}{src.suffix}"
                    main_name = dst.name
                else:
                    extra_num = len(extras_names) + 1
                    dst = src.parent / f"{tid}_{extra_num}{src.suffix}"
                    extras_names.append(dst.name)
                
                if src != dst:
                    try:
                        if dst.exists():
                            dst.unlink()
                        src.rename(dst)
                    except Exception as e:
                        err_msg += f"Error; "
            
            rows.append([tid, main_name or "", ";".join(extras_names), err_msg])
        
        # Zapisz Excel
        df_out = pd.DataFrame(rows, columns=["Indeks MDM", "Zdjęcie okładki/produktu", "Dodatkowe zdjęcia", "Błędy"])
        output_path = folder / f"wynik_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        df_out.to_excel(output_path, index=False)
        
        if progress_callback:
            progress_callback(100)
                
        return {"status": "success", "message": f"Przetworzono {len(rows)} produktów, raport: {output_path.name}", "file": str(output_path)}

    @staticmethod
    def resize_image(path: Path, max_w: int, max_h: int, quality: int = 85):
        try:
            with Image.open(path) as im:
                w, h = im.size
                if w <= max_w and h <= max_h: return
                
                ratio = min(max_w/w, max_h/h)
                new_size = (int(w*ratio), int(h*ratio))
                
                resized = im.resize(new_size, Image.Resampling.LANCZOS)
                resized.save(path, quality=quality, optimize=True)
        except Exception as e:
            logging.error(f"Resize error {path}: {e}")

# ═══════════════════════════════════════════════════════════════════════════
# KONFIGURACJA I STAŁE
# ═══════════════════════════════════════════════════════════════════════════

# Arabskie marki
ARABSKIE_MARKI = {
    'al haramain', 'ajmal', 'rasasi', 'swiss arabian', 'lattafa', 'armaf', 
    'khalis', 'al rehab', 'afnan', 'ard al zaafaran', 'nabeel', 'hamidi',
    'surrati', 'ahmed al maghribi', 'khadlaj', 'riiffs', 'anfar', 'asgharali',
    'al fakher', 'shaik', 'alexandria fragrances', 'fragrance du bois', 'zimaya'
}

# Składniki kompozycji
SKLADNIKI_KOMPOZYCJI = [
    'kwiatow', 'oriental', 'drzewn', 'szyprow', 'owocow', 'cytrusow', 
    'aromatyczn', 'przyprawow', 'zielon', 'ziołow', 'piżmow', 'waniliow', 
    'ambrów', 'fougere', 'morsk', 'wodn', 'bursztynow', 'skórzán', 'korzen', 
    'gourmand', 'aldehyd', 'paprociow', 'pralinow', 'karamelo', 'pikant', 
    'słodk', 'śwież'
]

# Słownik liczb słownych
LICZBY_SLOWNE = {
    'jeden': 1, 'jedna': 1, 'jedno': 1,
    'dwa': 2, 'dwie': 2, 'dwóch': 2, 'dwoch': 2,
    'trzy': 3, 'trzech': 3,
    'cztery': 4, 'czterech': 4,
    'pięć': 5, 'piec': 5, 'pieciu': 5, 'pięciu': 5,
    'sześć': 6, 'szesc': 6, 'szesciu': 6, 'sześciu': 6,
    'siedem': 7, 'siedmiu': 7,
    'osiem': 8, 'osmiu': 8, 'ośmiu': 8,
    'dziewięć': 9, 'dziewiec': 9, 'dziewieciu': 9,
    'dziesięć': 10, 'dziesiec': 10, 'dziesieciu': 10,
}

# ═══════════════════════════════════════════════════════════════════════════
# FUNKCJE POMOCNICZE (LOGIKA BIZNESOWA)
# ═══════════════════════════════════════════════════════════════════════════

def normalizuj_tekst(tekst: str) -> str:
    """Normalizuje tekst do porównywania"""
    if pd.isna(tekst):
        return ""
    return str(tekst).lower().strip()

def usun_html(tekst: str) -> str:
    """Usuwa tagi HTML z tekstu"""
    if pd.isna(tekst):
        return ""
    tekst = str(tekst)
    tekst = re.sub(r'<[^>]+>', ' ', tekst)
    tekst = re.sub(r'&[a-z]+;', ' ', tekst)
    tekst = re.sub(r'\s+', ' ', tekst)
    return tekst.strip()

def zamien_slowna_liczbe(tekst: str) -> str:
    """Zamienia słowne liczby na cyfry w tekście"""
    tekst_lower = tekst.lower()
    for slowo, liczba in LICZBY_SLOWNE.items():
        pattern = r'\b' + slowo + r'\b'
        tekst_lower = re.sub(pattern, str(liczba), tekst_lower)
    return tekst_lower

def wyciagnij_liczbe_sztuk(tekst: str) -> int:
    """Wyciąga liczbę sztuk z tekstu"""
    if not tekst:
        return 0
    
    tekst = zamien_slowna_liczbe(tekst)
    tekst = tekst.lower()
    
    patterns = [
        r'(\d+)\s*szt\.?',           # "3 szt.", "3szt"
        r'(\d+)\s*sztuk',            # "3 sztuki", "3 sztuk"
        r'(\d+)\s*-?\s*elementow',   # "3-elementowy"
        r'(\d+)\s*-?\s*częściow',    # "3-częściowy"
        r'(\d+)\s*-?\s*czesciow',    # "3-czesciowy"
        r'zestaw\s+(\d+)',           # "zestaw 3"
    ]
    
    for pattern in patterns:
        match = re.search(pattern, tekst)
        if match:
            return int(match.group(1))
    return 0

def wyciagnij_ml_z_tekstu(tekst):
    """Wyciąga wszystkie pojemności ml z tekstu"""
    wynik = []
    tekst_roboczy = tekst.lower()
    
    # 1. Wzorce NxY ml
    pattern_nxy = r'(\d+)\s*x\s*(\d+(?:[,.]?\d*)?)\s*ml\b'
    nxy_matches = list(re.finditer(pattern_nxy, tekst_roboczy, re.IGNORECASE))
    
    pozycje_nxy = []
    for match in nxy_matches:
        n = int(match.group(1))
        y_str = match.group(2).replace(',', '.')
        y = float(y_str) if y_str else 0
        for _ in range(n):
            wynik.append(y)
        pozycje_nxy.append((match.start(), match.end()))
    
    # Usuń NxY z tekstu
    for start, end in sorted(pozycje_nxy, reverse=True):
        tekst_roboczy = tekst_roboczy[:start] + ' ' * (end - start) + tekst_roboczy[end:]
    
    # 2. Pojedyncze ml
    pattern_ml = r'(\d+(?:[,.]?\d*)?)\s*ml\b'
    ml_matches = re.findall(pattern_ml, tekst_roboczy, re.IGNORECASE)
    for ml_str in ml_matches:
        ml_val = float(ml_str.replace(',', '.')) if ml_str else 0
        if 0.1 <= ml_val <= 5000:
            wynik.append(ml_val)
    
    # 3. Litry
    pattern_l = r'(\d+(?:[,.]?\d*)?)\s*l\b(?!i|a)'
    l_matches = re.findall(pattern_l, tekst.lower(), re.IGNORECASE)
    for l_str in l_matches:
        l_val = float(l_str.replace(',', '.')) if l_str else 0
        if 0.01 <= l_val < 10:
            wynik.append(l_val * 1000)
            
    return wynik

def wyciagnij_pojemnosci_core(opis: str, tytul: str) -> Tuple[List[float], float, str, int, str]:
    """Główna logika ekstrakcji (v9)"""
    opis_clean = usun_html(opis)
    tytul_clean = usun_html(tytul)
    
    if not opis_clean and not tytul_clean:
        return [], 0.0, "", 0, "BRAK_DANYCH"
    
    # Wyciągnij liczbę sztuk
    liczba_sztuk = wyciagnij_liczbe_sztuk(tytul_clean)
    if liczba_sztuk == 0:
        liczba_sztuk = wyciagnij_liczbe_sztuk(opis_clean)
    
    # KROK 1: Tytuł
    pojemnosci_tytul = wyciagnij_ml_z_tekstu(tytul_clean)
    
    # KROK 2: Opis (priorytet "Zestaw zawiera")
    sekcja_zestawu = None
    opis_lower = opis_clean.lower()
    wzorce_sekcji = [
        r'zestaw\s+zawiera[:\s]*(.{50,500}?)(?=\.|$|<|zestaw\s+zawiera)',
        r'w\s+zestawie[:\s]*(.{50,500}?)(?=\.|$|<)',
        r'zawartość\s+zestawu[:\s]*(.{50,500}?)(?=\.|$|<)',
        r'skład\s+zestawu[:\s]*(.{50,500}?)(?=\.|$|<)',
    ]
    for wzorzec in wzorce_sekcji:
        match = re.search(wzorzec, opis_lower, re.IGNORECASE | re.DOTALL)
        if match:
            sekcja_zestawu = match.group(1)
            break
            
    if sekcja_zestawu:
        pojemnosci_opis = wyciagnij_ml_z_tekstu(sekcja_zestawu)
    else:
        pojemnosci_opis = wyciagnij_ml_z_tekstu(opis_clean)
        
    # KROK 3: Połącz
    if pojemnosci_tytul:
        pojemnosci = pojemnosci_tytul.copy()
        tytul_set = set(pojemnosci_tytul)
        for poj in pojemnosci_opis:
            if poj not in tytul_set:
                pojemnosci.append(poj)
    else:
        pojemnosci = pojemnosci_opis.copy()
        
    # KROK 3.5: Ograniczenia
    MAX_ELEMENTOW = 8
    MAX_SUMA_ML = 800
    
    if len(pojemnosci) > MAX_ELEMENTOW:
        pojemnosci = pojemnosci[:MAX_ELEMENTOW]
        
    if sum(pojemnosci) > MAX_SUMA_ML:
        if pojemnosci_tytul:
            pojemnosci = pojemnosci_tytul[:MAX_ELEMENTOW]
        else:
            pojemnosci = pojemnosci[:3]
            
    # KROK 4: Mnożenie
    if liczba_sztuk > 1 and len(pojemnosci) == 1:
        pojemnosc_bazowa = pojemnosci[0]
        ile_razy = min(liczba_sztuk, 6)
        pojemnosci = [pojemnosc_bazowa] * ile_razy
        
    # KROK 4.5: Ostateczne ograniczenie
    suma_finalna = sum(pojemnosci)
    if suma_finalna > MAX_SUMA_ML:
        pojemnosci_nowe = []
        suma = 0
        for p in pojemnosci:
            if suma + p <= MAX_SUMA_ML:
                pojemnosci_nowe.append(p)
                suma += p
            else:
                break
        pojemnosci = pojemnosci_nowe if pojemnosci_nowe else pojemnosci[:1]
        
    # Status i szczegóły
    status = "OK"
    if not pojemnosci:
        status = f"BRAK_ML_ALE_{liczba_sztuk}_SZT" if liczba_sztuk > 0 else "BRAK_DANYCH"
    elif liczba_sztuk > 1 and len(pojemnosci) > 1 and len(pojemnosci) < liczba_sztuk:
        status = f"SPRAWDZ_{len(pojemnosci)}_POJ_VS_{liczba_sztuk}_SZT"
        
    suma_ml = sum(pojemnosci)
    pojemnosci_str = [f"{int(p)} ml" if p.is_integer() else f"{p:.1f} ml".replace('.0 ', ' ') for p in pojemnosci]
    szczegoly = ' + '.join(pojemnosci_str)
    
    return pojemnosci, suma_ml, szczegoly, liczba_sztuk, status

def wyciagnij_pojemnosc(opis: str, tytul: str, extra_text: str = "") -> Tuple[Optional[str], str, str]:
    """Wrapper dla kompatybilności"""
    _, suma_ml, szczegoly, _, status_kod = wyciagnij_pojemnosci_core(opis, tytul)
    
    if suma_ml > 0:
        pojemnosc_str = f"{int(suma_ml)} ml" if suma_ml.is_integer() else f"{suma_ml:.1f} ml"
        return pojemnosc_str, "OK", szczegoly
    else:
        return None, "BRAK_DANYCH", ""

def napraw_linie(linia: str, marka: str, linie_set: set, linie_map: dict) -> Tuple[Optional[str], bool, str]:
    if pd.isna(linia) or pd.isna(marka):
        return None, False, 'niepewna'
    
    linia_lower = normalizuj_tekst(linia)
    marka_lower = normalizuj_tekst(marka)
    
    if marka_lower and marka_lower in linia_lower and marka_lower != 'inna':
        linia_clean = linia_lower.replace(marka_lower, '').strip()
        linia_clean = re.sub(r'^[,\s\-]+|[,\s\-]+$', '', linia_clean)
        
        if linia_clean and linia_clean in linie_set:
            return linie_map[linia_clean], True, 'slownik'
        elif linia_clean and len(linia_clean) >= 3:
            return linia_clean.title(), True, 'kontekst'
        else:
            return None, False, 'niepewna'
    
    if linia_lower in linie_set:
        return linie_map[linia_lower], False, 'slownik'
    
    return linia, False, 'kontekst'

def wyciagnij_plec(opis: str, tytul: str) -> Tuple[Optional[str], str]:
    tekst = f"{opis} {tytul}".lower() if pd.notna(opis) and pd.notna(tytul) else ""
    
    if any(w in tekst for w in ['dla kobiet', 'damsk', 'kobieca', 'femme', 'woman', 'women']):
        return 'damskie', 'wykryta'
    if any(w in tekst for w in ['dla mężczyzn', 'męsk', 'for men', 'homme', ' man ', 'gentleman']):
        return 'męskie', 'wykryta'
    if any(w in tekst for w in ['unisex', 'uniseks']):
        return 'unisex', 'wykryta'
    if any(w in tekst for w in ['dzieci', 'dziecka', 'kids', 'baby']):
        if any(w in tekst for w in ['dziewczynk', 'girl']):
            return 'dziewczynka', 'wykryta'
        if any(w in tekst for w in ['chłop', 'boy']):
            return 'chłopiec', 'wykryta'
        return 'dziecko', 'wykryta'
    return None, 'fallback'

def wyciagnij_rodzaj_beauty(opis: str, tytul: str, beauty_set: set, beauty_map: dict) -> Tuple[str, str, list]:
    tekst = f"{opis} {tytul}".lower() if pd.notna(opis) and pd.notna(tytul) else ""
    znalezione = []
    pewnosc = 'slownik'
    brakujace_beauty = []
    
    if 'zestaw' in tekst:
        znalezione.append('zestaw')
    
    typy = [
        (['woda perfumowana', 'eau de parfum', 'edp'], 'woda perfumowana'),
        (['woda toaletowa', 'eau de toilette', 'edt'], 'woda toaletowa'),
        (['woda kolońska', 'eau de cologne'], 'woda kolońska'),
        (['perfumy', 'parfum'], 'perfumy'),
        (['balsam do ciała', 'balsam'], 'balsam'),
        (['żel pod prysznic', 'żel do mycia', 'żel'], 'żel'),
        (['dezodorant'], 'dezodorant'),
        (['krem'], 'krem'),
        (['mleczko'], 'mleczko'),
        (['mydło'], 'mydło'),
        (['olejek'], 'olejek')
    ]
    
    for wzorce, nazwa in typy:
        for wzor in wzorce:
            if wzor in tekst:
                if nazwa.lower() in beauty_set:
                    znaleziony = beauty_map[nazwa.lower()]
                    if znaleziony not in znalezione:
                        znalezione.append(znaleziony)
                else:
                    nazwa_cap = nazwa.capitalize()
                    if nazwa_cap not in znalezione:
                        brakujace_beauty.append({
                            'Wartość': nazwa_cap,
                            'Znaleziono': wzor
                        })
                        znalezione.append(nazwa_cap)
                        pewnosc = 'kontekst'
                break
    
    if znalezione:
        return ';'.join(znalezione), pewnosc, brakujace_beauty
    
    return 'zestaw', 'fallback', []

def normalizuj_kompozycje(tekst: str) -> str:
    tekst = tekst.strip()
    zamiany = {'owa': 'owe', 'owy': 'owe', 'ową': 'owe', 'ny': 'ne', 'na': 'ne', 'ną': 'ne'}
    for stara, nowa in zamiany.items():
        if tekst.lower().endswith(stara):
            return tekst[:-len(stara)] + nowa
    return tekst

def czy_prawidlowy_skladnik(slowo):
    for skladnik in SKLADNIKI_KOMPOZYCJI:
        if slowo.startswith(skladnik):
            return True
    return False

def wyciagnij_kompozycje(opis: str, tytul: str, plec: str, kompozycje_set: set, kompozycje_map: dict) -> Tuple[str, str, Optional[dict]]:
    if pd.isna(opis):
        opis = ""
    
    tekst = opis.lower()
    brakujaca_kompozycja = None
    
    # 1. Złożone
    pattern_zlozony = r'\b([a-ząćęłńóśźż]+\-[a-ząćęłńóśźż]+(?:\-[a-ząćęłńóśźż]+)?)\b'
    zlozone = re.findall(pattern_zlozony, tekst)
    
    for zlozony in zlozone:
        if zlozony.endswith(('owy', 'owa', 'owe', 'ny', 'na', 'ne')) and len(zlozony) > 8:
            czesci = zlozony.split('-')
            if all(czy_prawidlowy_skladnik(czesc) for czesc in czesci):
                kompozycja = normalizuj_kompozycje(zlozony).capitalize()
                
                if kompozycja.lower() in kompozycje_set:
                    return kompozycje_map[kompozycja.lower()], 'slownik', None
                else:
                    brakujaca_kompozycja = {
                        'Wartość': kompozycja,
                        'Znaleziono': zlozony
                    }
                    return kompozycja, 'kontekst', brakujaca_kompozycja
    
    # 2. Słownik
    for kompozycja in sorted(kompozycje_set, key=len, reverse=True):
        if len(kompozycja) >= 10 and kompozycja in tekst:
            return kompozycje_map[kompozycja], 'slownik', None
    
    # 3. Fallback
    if plec == 'damskie':
        return kompozycje_map.get('kwiatowe', 'Kwiatowe'), 'fallback', None
    elif plec == 'męskie':
        return kompozycje_map.get('drzewne', 'Drzewne'), 'fallback', None
    else:
        return kompozycje_map.get('świeże', 'Świeże'), 'fallback', None

def czy_perfumy_arabskie(marka, opis, tytul):
    tekst = f"{marka} {opis} {tytul}".lower()
    
    for am in ARABSKIE_MARKI:
        if am in str(marka).lower():
            return "arabskie"
    
    for kw in ['arabian', 'arabic', ' oud ', ' oudh ', 'attar']:
        if kw in tekst:
            return "arabskie"
    
    return None

# ═══════════════════════════════════════════════════════════════════════════
# GŁÓWNA FUNKCJA PRZETWARZAJĄCA
# ═══════════════════════════════════════════════════════════════════════════

def process_perfume_data(
    source_file: bytes,
    dict_marki: bytes,
    dict_linie: bytes,
    dict_beauty: bytes,
    dict_kompozycje: bytes
) -> Tuple[io.BytesIO, io.BytesIO, io.BytesIO, str]:
    """
    Główna funkcja przetwarzająca dane.
    Zwraca: (plik_wynikowy, plik_brakujace, plik_weryfikacja, raport_text)
    """
    
    # Wczytaj dane
    df = pd.read_excel(io.BytesIO(source_file), header=0)
    
    # Wczytaj słowniki
    marki_df = pd.read_excel(io.BytesIO(dict_marki))
    linie_df = pd.read_excel(io.BytesIO(dict_linie))
    beauty_df = pd.read_excel(io.BytesIO(dict_beauty))
    kompozycje_df = pd.read_excel(io.BytesIO(dict_kompozycje))
    
    # Przygotuj sety i mapy
    marki_set = set(marki_df[marki_df['Status'] == 'zaakceptowany']['Nazwa'].str.lower())
    linie_set = set(linie_df[linie_df['Status'] == 'zaakceptowany']['Nazwa'].str.lower())
    beauty_set = set(beauty_df[beauty_df['Status'] == 'zaakceptowany']['Nazwa'].str.lower())
    kompozycje_set = set(kompozycje_df[kompozycje_df['Status'] == 'zaakceptowany']['Nazwa'].str.lower())
    
    linie_map = {v.lower(): v for v in linie_df[linie_df['Status'] == 'zaakceptowany']['Nazwa']}
    beauty_map = {v.lower(): v for v in beauty_df[beauty_df['Status'] == 'zaakceptowany']['Nazwa']}
    kompozycje_map = {v.lower(): v for v in kompozycje_df[kompozycje_df['Status'] == 'zaakceptowany']['Nazwa']}
    
    # Liczniki i listy
    licznik = {
        'linia_slownik': 0, 'linia_kontekst': 0, 'linia_naprawione': 0,
        'pojemnosc_z_opisu': 0, 'pojemnosc_fallback': 0,
        'plec_wykryte': 0, 'plec_fallback': 0,
        'beauty_slownik': 0, 'beauty_kontekst': 0, 'beauty_fallback': 0,
        'kompozycja_slownik': 0, 'kompozycja_kontekst': 0, 'kompozycja_fallback': 0,
        'typ_arabskie': 0
    }
    
    brakujace = {
        'linie_pewne': [], 'linie_niepewne': [],
        'beauty_pewne': [], 'beauty_niepewne': [],
        'kompozycje_pewne': [], 'kompozycje_niepewne': [],
        'pojemnosci_do_web_search': []
    }
    
    produkty_do_web_search = []
    
    # Pętla przetwarzania
    for idx, row in df.iterrows():
        if idx == 0: continue
        
        marka = row['uzupełnić puse i inna marka']
        opis = row['Unnamed: 4']
        tytul = row['Unnamed: 11']
        indeks_gold = row['Unnamed: 0']
        indeks_mdm = row['Unnamed: 1']
        
        # 1. LINIA
        linia_current = row['uzupełnić puste  - nie powielamy nazwy marki']
        if pd.notna(linia_current):
            linia_naprawiona, byla_zmiana, pewnosc = napraw_linie(linia_current, marka, linie_set, linie_map)
            
            if linia_naprawiona:
                df.at[idx, 'uzupełnić puste  - nie powielamy nazwy marki'] = linia_naprawiona
                if byla_zmiana: licznik['linia_naprawione'] += 1
                
                if pewnosc == 'slownik':
                    licznik['linia_slownik'] += 1
                elif pewnosc == 'kontekst':
                    licznik['linia_kontekst'] += 1
                    brakujace['linie_pewne'].append({
                        'Indeks Gold': indeks_gold, 'Indeks MDM': indeks_mdm,
                        'Tytuł': str(tytul)[:80], 'Wartość': linia_naprawiona
                    })
                else:
                    brakujace['linie_niepewne'].append({
                        'Indeks Gold': indeks_gold, 'Indeks MDM': indeks_mdm,
                        'Tytuł': str(tytul)[:80], 'Wartość': linia_current,
                        'Problem': 'Nie udało się wyciągnąć linii'
                    })
        
        # 2. POJEMNOŚĆ
        extra_info = row['uzupełnić podając pojemni=ości po +'] if pd.notna(row['uzupełnić podając pojemni=ości po +']) else ""
        poj, pewnosc_poj, szczegoly = wyciagnij_pojemnosc(opis, tytul, extra_info)
        
        if pd.isna(row['uzupełnić podając łączną pojemność zestawu']):
            if poj:
                df.at[idx, 'uzupełnić podając łączną pojemność zestawu'] = poj
                licznik['pojemnosc_z_opisu'] += 1
            else:
                produkty_do_web_search.append({
                    'idx': idx, 'indeks_gold': indeks_gold, 'indeks_mdm': indeks_mdm,
                    'marka': marka, 'tytul': tytul
                })
        
        if pd.isna(row['uzupełnić podając pojemni=ości po +']):
            if szczegoly:
                df.at[idx, 'uzupełnić podając pojemni=ości po +'] = szczegoly
            else:
                laczna = df.at[idx, 'uzupełnić podając łączną pojemność zestawu']
                if pd.notna(laczna):
                    df.at[idx, 'uzupełnić podając pojemni=ości po +'] = str(laczna)
        
        # 3. PŁEĆ
        if pd.isna(row['uzupełnić: damskie, męskie lub unisex']):
            plec, pewnosc_plec = wyciagnij_plec(opis, tytul)
            if plec:
                df.at[idx, 'uzupełnić: damskie, męskie lub unisex'] = plec
                if pewnosc_plec == 'wykryta': licznik['plec_wykryte'] += 1
            else:
                df.at[idx, 'uzupełnić: damskie, męskie lub unisex'] = 'unisex'
                licznik['plec_fallback'] += 1
        
        plec_final = df.at[idx, 'uzupełnić: damskie, męskie lub unisex']
        
        # 4. RODZAJ BEAUTY
        if pd.isna(row['uzupełnić puste, usunąć zestaw']):
            rodzaj, pewnosc_beauty, brakujace_b = wyciagnij_rodzaj_beauty(opis, tytul, beauty_set, beauty_map)
            df.at[idx, 'uzupełnić puste, usunąć zestaw'] = rodzaj
            
            if pewnosc_beauty == 'slownik': licznik['beauty_slownik'] += 1
            elif pewnosc_beauty == 'kontekst': licznik['beauty_kontekst'] += 1
            else: licznik['beauty_fallback'] += 1
            
            for b in brakujace_b:
                b.update({'Indeks Gold': indeks_gold, 'Indeks MDM': indeks_mdm, 'Tytuł': str(tytul)[:80]})
                brakujace['beauty_niepewne'].append(b)
        
        # 5. KOMPOZYCJA
        if pd.isna(row['uzupełnić puste']):
            komp, pewnosc_komp, brakujaca_k = wyciagnij_kompozycje(opis, tytul, plec_final, kompozycje_set, kompozycje_map)
            df.at[idx, 'uzupełnić puste'] = komp
            
            if pewnosc_komp == 'slownik': licznik['kompozycja_slownik'] += 1
            elif pewnosc_komp == 'kontekst': licznik['kompozycja_kontekst'] += 1
            else: licznik['kompozycja_fallback'] += 1
            
            if brakujaca_k:
                brakujaca_k.update({'Indeks Gold': indeks_gold, 'Indeks MDM': indeks_mdm, 'Tytuł': str(tytul)[:80]})
                brakujace['kompozycje_pewne'].append(brakujaca_k)
        
        # 6. ARABSKIE
        if pd.isna(row['np.. Arabskie']) or row['np.. Arabskie'] == '':
            typ = czy_perfumy_arabskie(marka, opis, tytul)
            if typ:
                df.at[idx, 'np.. Arabskie'] = typ
                licznik['typ_arabskie'] += 1
    
    # Fallbacki pojemności
    for produkt in produkty_do_web_search:
        idx = produkt['idx']
        df.at[idx, 'uzupełnić podając łączną pojemność zestawu'] = '100 ml'
        if pd.isna(df.at[idx, 'uzupełnić podając pojemni=ości po +']):
            df.at[idx, 'uzupełnić podając pojemni=ości po +'] = '100 ml'
        licznik['pojemnosc_fallback'] += 1
        brakujace['pojemnosci_do_web_search'].append({
            'Indeks Gold': produkt['indeks_gold'], 'Indeks MDM': produkt['indeks_mdm'],
            'Marka': produkt['marka'], 'Tytuł': str(produkt['tytul'])[:80]
        })
    
    # Generowanie plików wyjściowych
    
    # 1. Główny plik
    output_main = io.BytesIO()
    df.to_excel(output_main, index=False)
    output_main.seek(0)
    
    # 2. Brakujące (Pewne)
    output_missing = io.BytesIO()
    with pd.ExcelWriter(output_missing, engine='openpyxl') as writer:
        if brakujace['linie_pewne']:
            pd.DataFrame(brakujace['linie_pewne']).to_excel(writer, sheet_name='Linie_wszystkie', index=False)
        if brakujace['kompozycje_pewne']:
            pd.DataFrame(brakujace['kompozycje_pewne']).to_excel(writer, sheet_name='Kompozycje_wszystkie', index=False)
    output_missing.seek(0)
    
    # 3. Do weryfikacji (Niepewne)
    output_verify = io.BytesIO()
    with pd.ExcelWriter(output_verify, engine='openpyxl') as writer:
        if brakujace['linie_niepewne']:
            pd.DataFrame(brakujace['linie_niepewne']).to_excel(writer, sheet_name='Linie_niepewne', index=False)
        if brakujace['beauty_niepewne']:
            pd.DataFrame(brakujace['beauty_niepewne']).to_excel(writer, sheet_name='Beauty_wszystkie', index=False)
        if brakujace['pojemnosci_do_web_search']:
            pd.DataFrame(brakujace['pojemnosci_do_web_search']).to_excel(writer, sheet_name='Pojemnosci_web_search', index=False)
    output_verify.seek(0)
    
    # Raport
    raport = f"""
    RAPORT KOŃCOWY - ULTIMATE SYSTEM WYPEŁNIANIA
    Data: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
    Produktów: {len(df) - 1}
    
    STATYSTYKI:
    Linia (słownik/kontekst/naprawione): {licznik['linia_slownik']} / {licznik['linia_kontekst']} / {licznik['linia_naprawione']}
    Pojemność (opis/fallback): {licznik['pojemnosc_z_opisu']} / {licznik['pojemnosc_fallback']}
    Płeć (wykryte/fallback): {licznik['plec_wykryte']} / {licznik['plec_fallback']}
    Beauty (słownik/kontekst/fallback): {licznik['beauty_slownik']} / {licznik['beauty_kontekst']} / {licznik['beauty_fallback']}
    Kompozycja (słownik/kontekst/fallback): {licznik['kompozycja_slownik']} / {licznik['kompozycja_kontekst']} / {licznik['kompozycja_fallback']}
    Arabskie: {licznik['typ_arabskie']}
    """
    
    return output_main, output_missing, output_verify, raport
# ═══════════════════════════════════════════════════════════════════════════
# PRICE MONITOR MODULE
# ═══════════════════════════════════════════════════════════════════════════

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
            if "p-desktop-cover" in res.text: # Already on product page
                product_link = res.url
            else:
                # Find first product in search results
                link_tag = soup.select_one('.search-list-item-hover a')
                if link_tag:
                    product_link = "https://www.empik.com" + link_tag['href'] if link_tag['href'].startswith('/') else link_tag['href']
            
            if not product_link:
                return {"ean": ean, "status": "not_found", "error": "Product not found"}

            # 2. Get product details
            if product_link != res.url:
                res = requests.get(product_link, headers=cls.HEADERS, timeout=10)
                soup = BeautifulSoup(res.text, 'lxml')

            # Extract Title
            title_tag = soup.select_one('h1.css-12vqlj3-productTitle-productTitle') or soup.select_one('h1')
            title = title_tag.get_text(strip=True) if title_tag else "Unknown"

            # Extract Buy Box Price
            price_tag = soup.select_one('.css-12q85p5-price-price') or soup.select_one('.productPrice')
            price = "0.00"
            if price_tag:
                price = price_tag.get_text(strip=True).replace('zł', '').replace(',', '.').replace(' ', '')

            # Extract Seller Name (Buy Box)
            seller_tag = soup.select_one('.css-1db90h3-sellerInfo-sellerLink') or soup.select_one('.seller-name a')
            seller = seller_tag.get_text(strip=True) if seller_tag else "Empik"

            # Determine Status
            status = "neutral"
            if my_shop_name:
                if my_shop_name.lower() in seller.lower():
                    status = "winning" # You have the Buy Box
                else:
                    status = "losing" # Someone else has it
            
            return {
                "ean": ean,
                "title": title,
                "price": price,
                "seller": seller,
                "url": product_link,
                "status": status,
                "timestamp": datetime.now().isoformat()
            }

        except Exception as e:
            return {"ean": ean, "status": "error", "error": str(e)}

# -
# AI GENERATOR MODULE
# 

class AiGenerator:
    '''
    Generator opis�w HTML zgodnych z wymogami Empik.
    Uzywa szablon�w (Smart Templates) zamiast LLM (na razie).
    '''

    @staticmethod
    def generate_description(data: dict) -> str:
        name = data.get('name', 'Produkt')
        features = data.get('features', [])
        specs = data.get('specs', {})
        
        # Clean features
        features = [f.strip() for f in features if f.strip()]
        
        # Build HTML
        html = f'''<section class='section'>
<div class='item item-12'>
<section class='text-item'>
<h1>{name}</h1>
</section>
</div>
</section>
'''

        # Features Section
        if features:
            html += '''<section class='section'>
<div class='item item-12'>
<section class='text-item'>
<h2>Najwazniejsze cechy</h2>
<ul>
'''
            for feature in features:
                html += f'<li>{feature}</li>\n'
            html += '''</ul>
</section>
</div>
</section>
'''

        # Specs Section
        if specs:
            html += '''<section class='section'>
<div class='item item-12'>
<section class='text-item'>
<h2>Specyfikacja techniczna</h2>
<table>
<tbody>
'''
            for key, value in specs.items():
                if key.strip() and value.strip():
                    html += f'<tr><td><strong>{key}</strong></td><td>{value}</td></tr>\n'
            html += '''</tbody>
</table>
</section>
</div>
</section>
'''

        return html

# 
# IMAGE VALIDATOR MODULE
# 

class ImageValidator:
    '''
    Walidacja obraz�w pod katem wymog�w Empik (biale tlo).
    '''

    @staticmethod
    def check_white_background(image_path: str, tolerance: int = 10) -> dict:
        try:
            with Image.open(image_path) as img:
                img = img.convert('RGB')
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
                # Sample 100 points from each edge
                edge_pixels = []
                for i in range(0, width, max(1, width//100)):
                    edge_pixels.append(img.getpixel((i, 0)))
                    edge_pixels.append(img.getpixel((i, height-1)))
                for i in range(0, height, max(1, height//100)):
                    edge_pixels.append(img.getpixel((0, i)))
                    edge_pixels.append(img.getpixel((width-1, i)))
                
                non_white_edges = 0
                for p in edge_pixels:
                    if any(x < (255 - tolerance) for x in p):
                        non_white_edges += 1
                
                edge_fail_ratio = non_white_edges / len(edge_pixels) if edge_pixels else 0
                
                is_valid = non_white_corners == 0 and edge_fail_ratio < 0.05
                
                return {
                    'is_valid': is_valid,
                    'non_white_corners': non_white_corners,
                    'edge_fail_ratio': edge_fail_ratio,
                    'message': 'OK' if is_valid else 'Tlo nie jest biale (sprawdz rogi i krawedzie)'
                }
        except Exception as e:
            return {'is_valid': False, 'message': f'Blad pliku: {str(e)}'}

