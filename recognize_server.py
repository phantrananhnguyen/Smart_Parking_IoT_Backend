import os
import cv2
import traceback
import re
import numpy as np
from PIL import Image
from datetime import datetime
from flask import Flask, request, jsonify
from ultralytics import YOLO
from vietocr.tool.predictor import Predictor
from vietocr.tool.config import Cfg

# ============================
# 1️⃣ Khởi tạo mô hình YOLOv8 và VietOCR
# ============================
print("🔁 Đang tải mô hình YOLOv8 và VietOCR...")
model = YOLO('E:\\Downloads\\bienso\\bienso\\runs\\detect\\train3\\weights\\best.pt')

config = Cfg.load_config_from_name('vgg_transformer')
config['weights'] = 'E:\\Downloads\\bienso\\bienso\\vgg-transformer.pth'
config['cnn']['pretrained'] = False
config['device'] = 'cuda'
ocr = Predictor(config)
print("✅ Mô hình đã sẵn sàng.")

# ============================
# 2️⃣ Thư mục lưu ảnh debug
# ============================
os.makedirs('plates', exist_ok=True)
pattern = re.compile(r'^\d{2}[A-Z]{1,2}\d{3,5}$', re.IGNORECASE)

def clean_text(text):
    # Xóa ký tự đặc biệt, giữ lại chữ và số
    return re.sub(r'[^A-Z0-9]', '', text.upper())

def recognize_from_image_array(frame):
    results = model(frame)
    plates_text = []

    for box in results[0].boxes.xyxy:
        x1, y1, x2, y2 = map(int, box.cpu().numpy())
        plate_img = frame[y1:y2, x1:x2]

        # (Optional) lưu ảnh biển số để debug
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S_%f')

        try:
            pil_img = Image.fromarray(plate_img).convert('RGB')
            plate_np = np.array(pil_img)
            h, w = plate_np.shape[:2]

            if h > 0.5 * w:
                upper = plate_np[0:h//2, :]
                lower = plate_np[h//2:, :]
                up_text = ocr.predict(Image.fromarray(upper)).strip()
                lo_text = ocr.predict(Image.fromarray(lower)).strip()
                text = up_text + lo_text
            else:
                text = ocr.predict(pil_img).strip()

            # Chuẩn hóa text: bỏ ký tự đặc biệt, uppercase
            text = clean_text(text)

            # Kiểm tra pattern hợp lệ
            if text and pattern.match(text):
                plates_text.append(text)
            else:
                print(f"[⚠️ Không hợp lệ]: {text}")

        except Exception as e:
            print("[❌ OCR lỗi]:", e)
            traceback.print_exc()

    return plates_text

# ============================
# 4️⃣ Flask API
# ============================
app = Flask(__name__)

@app.route('/recognize', methods=['POST'])
def recognize():
    if 'image' not in request.files:
        return jsonify({'error': 'Missing image'}), 400
    try:
        data = request.files['image'].read()
        frame = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        results = recognize_from_image_array(frame)

        # 🔔 In ra console các biển số đã detect được
        if results:
            print(f"[API] Detected plates: {results}")
        else:
            print("[API] No plates detected.")

        return jsonify({ 'plate': results[0] if results else "",'plates': results})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
