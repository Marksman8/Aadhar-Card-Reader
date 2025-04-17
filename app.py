from flask import Flask, render_template, request, jsonify, send_file
import cv2
import pytesseract
import re
import os
import base64
import numpy as np

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'  # Change if needed

app = Flask(__name__)
UPLOAD_FOLDER = r'C:\aadhar_app'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

form_data = {}

def decode_image(base64_string, filename):
    img_data = base64.b64decode(base64_string.split(',')[1])
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    with open(filepath, 'wb') as f:
        f.write(img_data)
    return filepath

def preprocess_image(img_path):
    image = cv2.imread(img_path)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    denoised = cv2.bilateralFilter(gray, 11, 17, 17)
    thresh = cv2.adaptiveThreshold(denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                   cv2.THRESH_BINARY, 11, 2)
    return thresh

def extract_text(img_path):
    preprocessed = preprocess_image(img_path)
    config = r'--psm 6 -c preserve_interword_spaces=1'
    return pytesseract.image_to_string(preprocessed, config=config)

def extract_front_data(text):
    lines = [line.strip() for line in text.split('\n') if line.strip() != '']

    name, dob, gender, aadhaar, phone = '', '', '', '', ''

    
    aadhaar_match = re.search(r'(\d{4}\s\d{4}\s\d{4})', text)
    if aadhaar_match:
        aadhaar_num = aadhaar_match.group(1).replace(' ', '')
        aadhaar = f"XXXX-XXXX-{aadhaar_num[-4:]}"

    
    for line in lines:
        dob_match = re.search(r'\d{2}/\d{2}/\d{4}', line)
        if dob_match:
            dob = dob_match.group(0)
            break

    for line in lines:
        if 'MALE' in line.upper():
            gender = 'Male'
            break
        elif 'FEMALE' in line.upper():
            gender = 'Female'
            break
        elif 'OTHER' in line.upper():
            gender = 'Other'
            break

    phone_match = re.search(r'(\+91[-\s]?|0)?[6-9]\d{9}', text)
    if phone_match:
        phone = phone_match.group(0)
        
    for i, line in enumerate(lines):
        if dob in line:
            for j in range(i-1, -1, -1):
                if not any(char.isdigit() for char in lines[j]) and lines[j].isupper():
                    name = lines[j]
                    break
            break

    return {
        "Name": name,
        "DOB": dob,
        "Gender": gender,
        "Aadhaar": aadhaar,
        "Phone": phone
    }

def extract_back_data(text):
    lines = [line.strip() for line in text.split('\n') if line.strip() != '']
    address = ' '.join(lines)
    pincode = ''

    # Pincode: from last line or whole address
    for line in reversed(lines):
        pin_match = re.search(r'\b\d{6}\b', line)
        if pin_match:
            pincode = pin_match.group(0)
            break

    return {
        "Address": address,
        "Pincode": pincode
    }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/process_image', methods=['POST'])
def process_image():
    global form_data
    img_data = request.json.get('image')
    side = request.json.get('side')

    filename = f"{side}.jpg"
    filepath = decode_image(img_data, filename)
    text = extract_text(filepath)

    if side == "front":
        form_data = extract_front_data(text)
        return jsonify({"status": "front_processed"})
    elif side == "back":
        form_data.update(extract_back_data(text))
        return jsonify({"status": "back_processed", "data": form_data})

@app.route('/download')
def download():
    path = os.path.join(UPLOAD_FOLDER, "aadhaar_form.txt")
    with open(path, 'w', encoding='utf-8') as f:
        for k, v in form_data.items():
            f.write(f"{k}: {v}\n")
    return send_file(path, as_attachment=True)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
