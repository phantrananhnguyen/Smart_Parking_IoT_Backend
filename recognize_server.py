import cv2
import numpy as np
from flask import Flask, request, jsonify
from PIL import Image
from ultralytics import YOLO
from vietocr.tool.predictor import Predictor
from vietocr.tool.config import Cfg
import re

# Load models
print("🔁 Đang tải YOLOv8 và VietOCR...")
yolo_model = YOLO('E:\\Downloads\\bienso\\bienso\\runs\\detect\\train3\\weights\\best.pt')

config = Cfg.load_config_from_name('vgg_transformer')
config['weights'] = 'E:\\Downloads\\bienso\\bienso\\vgg-transformer.pth'
config['cnn']['pretrained'] = False
config['device'] = 'cuda'
ocr_model = Predictor(config)
print("✅ Models đã sẵn sàng.")

# Biểu thức regex cho biển số Việt Nam
pattern = re.compile(r'^\d{2}[A-Z]{1,2}\d{2,3}[.\-]?\d{2}$', re.IGNORECASE)

def preprocess_plate(plate_img):
    plate_img = cv2.bilateralFilter(plate_img, 9, 75, 75)
    plate_img = cv2.convertScaleAbs(plate_img, alpha=1.5, beta=10)
    return plate_img

def recognize_from_image_array(frame):
    frame = cv2.resize(frame, (1280, 720))  # Resize để chuẩn hóa

    results = yolo_model(frame)
    texts = []

    for box in results[0].boxes.xyxy:
        x1, y1, x2, y2 = map(int, box.cpu().numpy())
        if (x2 - x1) < 50 or (y2 - y1) < 20:
            continue

        plate_img = frame[y1:y2, x1:x2]
        plate_img = preprocess_plate(plate_img)

        pil_img = Image.fromarray(cv2.cvtColor(plate_img, cv2.COLOR_BGR2RGB)).convert('RGB')
        plate_np = np.array(pil_img)
        h, w = plate_np.shape[:2]

        if h > 0.5 * w:
            try:
                upper_text = ocr_model.predict(Image.fromarray(plate_np[0:h//2, :])).strip()
                lower_text = ocr_model.predict(Image.fromarray(plate_np[h//2:, :])).strip()
                text = upper_text + lower_text
            except:
                text = ''
        else:
            try:
                text = ocr_model.predict(pil_img).strip()
            except:
                text = ''

        text = text.replace(" ", "").replace("-", "").replace(".", "").upper()

        # Kiểm tra đúng cấu trúc biển số Việt Nam
        if pattern.match(text):
            texts.append(text)

    return texts

# Flask server
app = Flask(__name__)

@app.route('/recognize', methods=['POST'])
def recognize():
    if 'image' not in request.files:
        return jsonify({"error": "Thiếu ảnh"}), 400

    file = request.files['image']
    image_bytes = file.read()
    np_arr = np.frombuffer(image_bytes, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    try:
        texts = recognize_from_image_array(frame)
        result = texts[0] if texts else ""
        return jsonify({"plate": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001)
