# recognize_server.py
from flask import Flask, request, jsonify
import numpy as np
import cv2
from PIL import Image
import io

from ultralytics import YOLO
from vietocr.tool.predictor import Predictor
from vietocr.tool.config import Cfg

# Khởi tạo model 1 lần duy nhất
print("🔁 Đang tải YOLOv8 và VietOCR...")
yolo_model = YOLO('E:\\Downloads\\bienso\\bienso\\runs\\detect\\train3\\weights\\best.pt')

config = Cfg.load_config_from_name('vgg_transformer')
config['weights'] = 'E:\\Downloads\\bienso\\bienso\\vgg-transformer.pth'
config['cnn']['pretrained'] = False
config['device'] = 'cuda'
ocr_model = Predictor(config)

print("✅ Models đã sẵn sàng.")

# Hàm nhận diện biển số
def recognize_from_image_array(frame):
    results = yolo_model(frame)
    texts = []

    for box in results[0].boxes.xyxy:
        x1, y1, x2, y2 = map(int, box.cpu().numpy())
        plate_img = frame[y1:y2, x1:x2]

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
        return jsonify({"plate": texts[0] if texts else ""})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001)
