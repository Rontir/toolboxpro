import io
import logging
from typing import Optional, Tuple, Literal
import numpy as np
from PIL import Image
from rembg import remove, new_session

logger = logging.getLogger(__name__)

class ClearcutEngine:
    def __init__(self):
        # Initialize session on first use or startup to load model
        try:
            self.session = new_session("u2net")
            logger.info("ClearcutEngine: rembg session initialized successfully")
        except Exception as e:
            logger.error(f"ClearcutEngine: Failed to initialize rembg session: {e}")
            self.session = None

    def remove_background(self, image_data: bytes) -> bytes:
        """
        Removes background from the given image bytes.
        Returns the processed image as bytes (PNG).
        """
        if not self.session:
            # Try to re-initialize if failed previously
            self.session = new_session("u2net")

        try:
            return remove(image_data, session=self.session)
        except Exception as e:
            logger.error(f"Error removing background: {e}")
            raise

    def process_image(
        self, 
        image_data: bytes, 
        crop_box: Optional[Tuple[int, int, int, int]] = None,
        format: Literal["PNG", "JPEG", "WEBP"] = "PNG",
        quality: int = 90
    ) -> bytes:
        """
        Process image with optional cropping and format conversion.
        """
        try:
            img = Image.open(io.BytesIO(image_data))
            
            # Apply crop if specified (left, top, right, bottom)
            if crop_box:
                img = img.crop(crop_box)
            
            # Convert to RGB if saving as JPEG (handling transparency)
            if format == "JPEG" and img.mode in ('RGBA', 'LA'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[-1])
                img = background
            
            output = io.BytesIO()
            img.save(output, format=format, quality=quality)
            return output.getvalue()
            
        except Exception as e:
            logger.error(f"Error processing image: {e}")
            raise
