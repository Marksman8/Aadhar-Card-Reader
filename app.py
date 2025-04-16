from flask import Flask, render_template, request, jsonify, send_file
import cv2
import pytesseract
import re
import os
import base64
import numpy as np

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

app = Flask(__name__)
UPLOAD_FOLDER = r'C:\aadhar app'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

form_data = {}

def decode_image(base64_string, filename):
    img_data = base64.b64decode(base64_string.split(',')[1])
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    with open(filepath, 'wb') as f:
        f.write(img_data)
    return filepath

def crop_to_reference_points(image):
    height, width = image.shape[:2]
    margin_x = int(width * 0.1)
    margin_y = int(height * 0.1)
    x1, y1 = margin_x, margin_y
    x2, y2 = width - margin_x, height - margin_y
    cropped = image[y1:y2, x1:x2]
    return cropped

def clean_image(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return cv2.cvtColor(thresh, cv2.COLOR_GRAY2BGR)

def extract_text(img_path):
    image = cv2.imread(img_path)
    cropped = crop_to_reference_points(image)
    cleaned = clean_image(cropped)
    config = r'--psm 6 -c preserve_interword_spaces=1'
    return pytesseract.image_to_string(cleaned, config=config)

def extract_front_data(text):
    lines = [line.strip() for line in text.split('\n') if line.strip()]

    name = ""
    dob = ""
    gender = ""
    phone = ""
    aadhaar_last4 = ""

    for line in lines:
        if not name and re.match(r'^[A-Z][a-z]+(\s[A-Z][a-z]+)+$', line):
            name = line
        if not dob:
            match = re.search(r'(\d{2}/\d{2}/\d{4})', line)
            if match:
                dob = match.group(0)
        if not gender:
            match = re.search(r'\b(Male|Female|Other)\b', line, re.IGNORECASE)
            if match:
                gender = match.group(0)
        if not phone:
            match = re.search(r'(\+91[-\s]?|0)?[6-9]\d{9}', line)
            if match:
                phone = match.group(0)
        if not aadhaar_last4:
            match = re.findall(r'(\d{4}\s\d{4}\s\d{4})', line)
            if match:
                aadhaar_last4 = match[0].replace(' ', '')[-4:]

    return {
        "Name": name,
        "DOB": dob,
        "Gender": gender,
        "Aadhaar": f"XXXX-XXXX-{aadhaar_last4}" if aadhaar_last4 else "",
        "Phone": phone
    }

def extract_back_data(text):
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    address = " ".join(lines)
    pincode = ""
    if lines:
        last_line = lines[-1]
        match = re.search(r'\b\d{6}\b', last_line)
        if match:
            pincode = match.group(0)
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
    with open(path, 'w') as f:
        for k, v in form_data.items():
            f.write(f"{k}: {v}\n")
    return send_file(path, as_attachment=True)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
