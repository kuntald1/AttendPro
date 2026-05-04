import cv2
import numpy as np
import base64
from typing import Optional, Tuple
import logging
import os

logger = logging.getLogger(__name__)

os.environ["MEDIAPIPE_DISABLE_GPU"] = "1"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"


class FaceRecognitionService:

    def __init__(self):
        self._opencv_detector = None

    def _load_opencv_detector(self):
        if self._opencv_detector is None:
            try:
                cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
                self._opencv_detector = cv2.CascadeClassifier(cascade_path)
                logger.info("OpenCV face detector loaded")
            except Exception as e:
                logger.error(f"OpenCV detector load error: {e}")
        return self._opencv_detector

    def decode_image(self, image_data: str) -> Optional[np.ndarray]:
        try:
            if "," in image_data:
                image_data = image_data.split(",")[1]
            img_bytes = base64.b64decode(image_data)
            nparr = np.frombuffer(img_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            return img
        except Exception as e:
            logger.error(f"Image decode error: {e}")
            return None

    def detect_face(self, image: np.ndarray) -> Tuple[bool, Optional[np.ndarray]]:
        try:
            detector = self._load_opencv_detector()
            if detector is None:
                return False, None

            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            gray = cv2.equalizeHist(gray)

            faces = detector.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=8,
                minSize=(80, 80),
                flags=cv2.CASCADE_SCALE_IMAGE
            )

            if len(faces) == 0:
                logger.info("No face detected by OpenCV")
                return False, None

            x, y, w, h = faces[0]
            logger.info(f"Face detected at x={x} y={y} w={w} h={h}")

            margin = int(0.25 * max(w, h))
            x1 = max(0, x - margin)
            y1 = max(0, y - margin)
            x2 = min(image.shape[1], x + w + margin)
            y2 = min(image.shape[0], y + h + margin)

            face_crop = image[y1:y2, x1:x2]
            if face_crop.size == 0:
                return False, None

            return True, face_crop

        except Exception as e:
            logger.error(f"Face detection error: {e}")
            return False, None

    def generate_embedding(self, face_image: np.ndarray) -> Optional[list]:
        try:
            from deepface import DeepFace
            face_resized = cv2.resize(face_image, (112, 112))
            result = DeepFace.represent(
                img_path=face_resized,
                model_name="VGG-Face",
                enforce_detection=False,
                detector_backend="skip"
            )
            if result and len(result) > 0:
                embedding = result[0]["embedding"]
                logger.info(f"Embedding generated, length: {len(embedding)}")
                return embedding
            return None
        except Exception as e:
            logger.error(f"Embedding generation error: {e}")
            return None

    def process_frame(self, image_data: str) -> Tuple[bool, Optional[list], str]:
        img = self.decode_image(image_data)
        if img is None:
            return False, None, "Invalid image data"

        logger.info(f"Image decoded: shape={img.shape}")

        found, face = self.detect_face(img)
        if not found or face is None:
            return False, None, "No face detected. Please look directly at the camera and ensure good lighting."

        logger.info(f"Face cropped: shape={face.shape}")

        embedding = self.generate_embedding(face)
        if embedding is None:
            return False, None, "Could not generate face embedding. Please try again."

        return True, embedding, "Face processed successfully"

    def cosine_similarity(self, vec1: list, vec2: list) -> float:
        a = np.array(vec1)
        b = np.array(vec2)
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-10))


face_service = FaceRecognitionService()
