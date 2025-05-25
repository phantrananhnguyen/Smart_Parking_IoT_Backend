import cv2
import numpy as np
from flask import Flask, request, jsonify
from PIL import Image
from ultralytics import YOLO
from vietocr.tool.predictor import Predictor
from vietocr.tool.config import Cfg
import re
import os

# ================================
# Load YOLOv8 & VietOCR
# ================================
print("🔁 Đang tải YOLOv8 và VietOCR...")
yolo_model = YOLO('E:\\Downloads\\bienso\\bienso\\runs\\detect\\train3\\weights\\best.pt')

config = Cfg.load_config_from_name('vgg_transformer')
config['weights'] = 'E:\\Downloads\\bienso\\bienso\\vgg-transformer.pth'
config['cnn']['pretrained'] = False
config['device'] = 'cuda'
ocr_model = Predictor(config)
print("✅ Models đã sẵn sàng.")

# ================================
# Regex & Mapping lỗi OCR
# ================================
pattern = re.compile(r'^\d{2}[A-Z]{1,2}\d{3,5}$', re.IGNORECASE)

common_misread = {
    '0': ['O'],
    '1': ['I', 'L'],
    '2': ['Z'],
    '5': ['S'],
    '7': ['F'],
    'F': ['7'],
    '8': ['B'],
}

def fix_ocr_errors(text):
    fixed = ''
    fixed_once = False  # Biến để chỉ sửa 1 lần thôi
    for idx, char in enumerate(text):
        if fixed_once:
            # Đã sửa xong 1 ký tự, các ký tự sau giữ nguyên
            fixed += char
            continue
        
        replaced = False
        for correct, wrongs in common_misread.items():
            if char in wrongs:
                if idx < 2:
                    # Vị trí 0,1 giữ nguyên
                    fixed += char
                else:
                    # Chỉ sửa 1 lần duy nhất ký tự nhầm ở đây
                    fixed += correct
                    fixed_once = True
                replaced = True
                break
        if not replaced:
            fixed += char
    return fixed




def clean_plate_text(text):
    text = text.upper().replace(" ", "").replace("-", "").replace(".", "")
    return re.sub(r'[^A-Z0-9]', '', text)

# ================================
# Tiền xử lý ảnh biển số
# ================================
def preprocess_plate(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(4,4))
    enhanced = clahe.apply(blur)
    thresh = cv2.adaptiveThreshold(enhanced, 255, 
                                   cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                   cv2.THRESH_BINARY_INV, 31, 10)
    return thresh

# ================================
# Nhận diện biển số
# ================================
def recognize_from_image_array(frame):
    debug_dir = "debug"
    os.makedirs(debug_dir, exist_ok=True)

    frame = cv2.resize(frame, (1920, 1080))  # Resize để YOLO detect tốt hơn
    results = yolo_model(frame)

    texts = []
    annotated_img = frame.copy()

    for i, box in enumerate(results[0].boxes):
        conf = box.conf.item()
        xyxy = box.xyxy.cpu().numpy()[0]
        x1, y1, x2, y2 = map(int, xyxy)


        if conf < 0.5 or (x2 - x1) < 50 or (y2 - y1) < 20:
            print(f"    ⛔ Bỏ qua biển quá nhỏ hoặc độ tin cậy thấp.")
            continue

        plate_img = frame[y1:y2, x1:x2]
        preprocessed = preprocess_plate(plate_img)

        
        pil_img = Image.fromarray(preprocessed).convert('RGB')
        plate_np = np.array(pil_img)
        h, w = plate_np.shape[:2]

        # OCR
        text = ''
        try:
            if h > 0.5 * w:  # Biển 2 hàng
                upper = plate_np[0:h // 2, :]
                lower = plate_np[h // 2:, :]
                upper_text = ocr_model.predict(Image.fromarray(upper)).strip()
                lower_text = ocr_model.predict(Image.fromarray(lower)).strip()
                text = upper_text + lower_text
            else:
                text = ocr_model.predict(pil_img).strip()
        except Exception as e:
            print(f"    ❌ OCR lỗi: {e}")
            continue

        # Làm sạch & sửa lỗi OCR
        text_clean = clean_plate_text(text)
        text_fixed = fix_ocr_errors(text_clean)

        print(f"    🔤 OCR Raw: {text} → Clean: {text_clean} → Fixed: {text_fixed}")

        if pattern.match(text_fixed):
            print(f"    ✅ Biển hợp lệ: {text_fixed}")
            texts.append((text_fixed, conf))
        else:
            print(f"    ⚠️ Biển không khớp regex: {text_fixed}")

        # Vẽ bounding box và text lên ảnh
        cv2.rectangle(annotated_img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(annotated_img, text_fixed, (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 0, 0), 2)

    if texts:
        texts.sort(key=lambda x: (pattern.match(x[0]) is not None, len(x[0]), x[1]), reverse=True)
        return [t[0] for t in texts]
    else:
        print("🟩 Kết quả nhận dạng: []")
        return []

# ================================
# Flask Server
# ================================
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
