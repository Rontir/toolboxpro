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
        # Using 'u2netp' (lightweight version) to save memory on Render
        self.model_name = "u2netp" 
        self.session = None

    def remove_background(self, image_data: bytes) -> bytes:
        """
        Removes background from the given image bytes.
        Returns the processed image as bytes (PNG).
        """
        if not self.session:
            # Lazy initialization to prevent startup timeouts
            try:
                self.session = new_session(self.model_name)
                logger.info(f"ClearcutEngine: rembg session ({self.model_name}) initialized successfully")
            except Exception as e:
                logger.error(f"ClearcutEngine: Failed to initialize rembg session: {e}")
                raise

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
