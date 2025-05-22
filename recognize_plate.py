# recognize_plate.py
import cv2
import numpy as np
import sys
from PIL import Image
from ultralytics import YOLO
from vietocr.tool.predictor import Predictor
from vietocr.tool.config import Cfg

# Load YOLOv8 và VietOCR
model = YOLO('E:\\Downloads\\bienso\\bienso\\runs\\detect\\train3\\weights\\best.pt')

config = Cfg.load_config_from_name('vgg_transformer')
config['weights'] = 'E:\\Downloads\\bienso\\bienso\\vgg-transformer.pth'
config['cnn']['pretrained'] = False
config['device'] = 'cuda'
ocr = Predictor(config)

def recognize(image_path):
    frame = cv2.imread(image_path)
    results = model(frame)

    texts = []

    for box in results[0].boxes.xyxy:
        x1, y1, x2, y2 = map(int, box.cpu().numpy())
        plate_img = frame[y1:y2, x1:x2]

        pil_img = Image.fromarray(cv2.cvtColor(plate_img, cv2.COLOR_BGR2RGB)).convert('RGB')
        plate_np = np.array(pil_img)
        h, w = plate_np.shape[:2]

        if h > 0.5 * w:
            try:
                upper_text = ocr.predict(Image.fromarray(plate_np[0:h//2, :])).strip()
                lower_text = ocr.predict(Image.fromarray(plate_np[h//2:, :])).strip()
                text = upper_text + lower_text
            except:
                text = ''
        else:
            try:
                text = ocr.predict(pil_img).strip()
            except:
                text = ''

        texts.append(text)

    return texts

if __name__ == "__main__":
    image_path = sys.argv[1]
    texts = recognize(image_path)
    if texts:
        print(texts[0])  # In ra biển đầu tiên (Node.js sẽ lấy stdout này)
    else:
        print("")  # Không nhận dạng được