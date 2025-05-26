import os
import re
import cv2
import time
import traceback
import numpy as np
from PIL import Image
from flask import Flask, request, jsonify
from ultralytics import YOLO
from vietocr.tool.config import Cfg
from vietocr.tool.predictor import Predictor

# ============================
# 1️⃣ Khởi tạo & Tải mô hình
# ============================
print("🔁 Đang tải mô hình YOLOv8 và VietOCR...")

yolo_model = YOLO('E:/Downloads/bienso/bienso/runs/detect/train3/weights/best.pt')

config = Cfg.load_config_from_name('vgg_transformer')
config['weights'] = 'E:/Downloads/bienso/bienso/vgg-transformer.pth'
config['cnn']['pretrained'] = False
config['device'] = 'cuda'  # 'cuda' hoặc 'cpu'
ocr_model = Predictor(config)

print("✅ Mô hình đã sẵn sàng.")

# ============================
# 2️⃣ Tiện ích hỗ trợ
# ============================
plate_pattern = re.compile(r'^[0-9]{2}[A-Z][0-9]{4,5}$')

replacements = {
    '0': ['O', 'D', 'Q'], '1': ['I', 'L'], '2': ['Z'],
    '5': ['S'], '6': ['G'], '7': ['T', 'F', 'Z'],
    '8': ['B'], 'B': ['8'], 'Q': ['0'],
    'T': ['7'], 'Z': ['7'], 'G': ['6'], 'F': ['7']
}

def fix_ocr_errors(text):
    text = text.upper().replace(" ", "").replace("-", "").replace(".", "")
    fixed = []

    for idx, char in enumerate(text):
        current_char = char

        if idx == 2:
            # Vị trí thứ 3 luôn là chữ cái
            if char.isdigit():
                num_to_char = {'7': 'F', '8': 'B', '0': 'D'}
                current_char = num_to_char.get(char, char)
        else:
            if char.isdigit():
                current_char = char  # Đã là số thì giữ nguyên
            else:
                for correct, wrongs in replacements.items():
                    if char in wrongs:
                        current_char = correct
                        break

        fixed.append(current_char)

    result = ''.join(fixed)

    # Định dạng: 2 chữ số + 1 chữ cái + 4-5 chữ số
    if len(result) == 8 and result[2].isalpha():
        result = f"{result[:2]}{result[2]}-{result[3:]}"
    elif len(result) > 8:
        result = result.replace("-", "").replace(".", "")
        if result[3].isdigit():
            result = f"{result[:3]}-{result[3:]}"

    # Xử lý các mẫu đặc biệt (nếu cần)
    if len(text) < 5:
        pattern_fixes = {
            '306': '30A6',
            '396': '39B6',
            '535': '53B5'
        }
        result = pattern_fixes.get(result, result)

    # Chuyển chuỗi số 6 chữ thành định dạng biển
    if len(result) == 6 and result.isdigit():
        result = f"{result[:2]}{chr(65 + int(result[2]))}{result[3:]}"

    # Loại bỏ ký tự lạ nếu không khớp pattern
    if not plate_pattern.match(result):
        result = re.sub(r'[^A-Z0-9]', '', result)

    return result[:12]  # Giới hạn độ dài tối đa

def clean_plate_text(text):
    text = text.upper().replace(" ", "").replace("-", "").replace(".", "")
    return re.sub(r'[^A-Z0-9]', '', text)
# ============================
# 3️⃣ Tiền xử lý ảnh
# ============================
def enhance_image(image):
    # Giảm nhiễu bảo toàn chi tiết
    denoised = cv2.fastNlMeansDenoisingColored(image, None, h=3, hColor=3, 
                                              templateWindowSize=7, searchWindowSize=21)
    
    # Lọc bilateral giữ biên
    bilateral = cv2.bilateralFilter(denoised, d=5, sigmaColor=50, sigmaSpace=50)
    
    # Tăng cường độ tương phản trong không gian LAB
    lab = cv2.cvtColor(bilateral, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l_clahe = clahe.apply(l)
    lab = cv2.merge((l_clahe, a, b))
    enhanced_lab = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    
    # Làm nét ảnh
    kernel = np.array([[-1,-1,-1], [-1,9,-1], [-1,-1,-1]])
    sharpened = cv2.filter2D(enhanced_lab, -1, kernel)
    
    return sharpened

def preprocess_plate(image):
    # Thêm xử lý tăng cường độ tương phản cục bộ
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l_channel, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
    cl = clahe.apply(l_channel)
    limg = cv2.merge((cl, a, b))
    enhanced = cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)
    
    # Kết hợp threshold động
    gray = cv2.cvtColor(enhanced, cv2.COLOR_BGR2GRAY)
    thresh = cv2.adaptiveThreshold(gray, 255, 
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
        cv2.THRESH_BINARY_INV, 11, 4)
    
    return thresh

# ============================
# 4️⃣ Nhận diện ảnh
# ============================
def recognize_from_image_array(frame):
    if frame is None or frame.size == 0:
        raise ValueError("Ảnh đầu vào không hợp lệ hoặc rỗng.")

    debug_dir = "debug"
    os.makedirs(debug_dir, exist_ok=True)
    timestamp = int(time.time())

    frame = cv2.resize(frame, (1280, 720))
    results = yolo_model(frame)
    texts = []
    annotated_img = frame.copy()

    for i, box in enumerate(results[0].boxes):
        conf = box.conf.item()
        xyxy = box.xyxy.cpu().numpy()[0]
        x1, y1, x2, y2 = map(int, xyxy)

        if conf < 0.5 or (x2 - x1) < 50 or (y2 - y1) < 20:
            continue

        plate_img = frame[y1:y2, x1:x2]
        preprocessed = preprocess_plate(plate_img)
        
        # Thêm resize để chuẩn hóa đầu vào
        plate_img = cv2.resize(plate_img, (300, 150)) 
        
        # Điều chỉnh ngưỡng và logic chia hàng
        h, w = plate_img.shape[:2]
        aspect_ratio = h / w

        try:
            if 0.5 < aspect_ratio < 0.8:  # Tỷ lệ phổ biến của biển 2 hàng
            # Tìm đường phân tách tối ưu bằng projection
                gray = cv2.cvtColor(plate_img, cv2.COLOR_BGR2GRAY)
                hist = cv2.reduce(gray, 1, cv2.REDUCE_AVG).reshape(-1)
                th = 0.8 * np.max(hist)
                split_line = np.where(hist < th)[0][0]
                
                upper = plate_img[:split_line, :]
                lower = plate_img[split_line:, :]
                
                # Xử lý OCR riêng
                upper_text = ocr_model.predict(Image.fromarray(upper)).strip()
                lower_text = ocr_model.predict(Image.fromarray(lower)).strip()
                text = upper_text + lower_text
            else:
                text = ocr_model.predict(Image.fromarray(plate_img)).strip()
        except Exception as e:
            print(f"[OCR Error] {e}")
            continue

        text_clean = clean_plate_text(text)
        text_fixed = fix_ocr_errors(text_clean)

        print(f"[OCR Process] Raw: {text} → Clean: {text_clean} → Fixed: {text_fixed}")

        if plate_pattern.match(text_fixed):
            texts.append((text_fixed, conf))

        # Vẽ kết quả lên ảnh
        cv2.rectangle(annotated_img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(annotated_img, text_fixed, (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 0, 0), 2)

    cv2.imwrite(f"{debug_dir}/annotated_{timestamp}.jpg", annotated_img)

    if texts:
        texts.sort(key=lambda x: (len(x[0]), x[1]), reverse=True)
        return [t[0] for t in texts]
    else:
        return []

# ============================
# 5️⃣ Flask API
# ============================
app = Flask(__name__)

@app.route('/recognize', methods=['POST'])
def recognize():
    if 'image' not in request.files:
        return jsonify({"error": "Missing image"}), 400

    file = request.files['image']
    image_bytes = file.read()
    np_arr = np.frombuffer(image_bytes, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    print(f"[INFO] Đang xử lý ảnh nhận được...")

    try:
        texts = recognize_from_image_array(frame)
        result = texts[0] if texts else ""
        print(f"[RESULT] Biển số nhận được: {result}")
        return jsonify({"plate": result})
    except Exception as e:
        print("[ERROR] Lỗi khi xử lý ảnh:")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# ============================
# 6️⃣ Chạy Flask
# ============================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)