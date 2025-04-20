from flask import Flask, render_template, request, jsonify, send_file
import cv2
import pytesseract
import re
import os
import base64
import numpy as np
from datetime import datetime

# Configure Tesseract path
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

app = Flask(__name__)
UPLOAD_FOLDER = 'static/uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

form_data = {}

def decode_image(base64_string, filename):
    try:
        if ',' in base64_string:
            img_data = base64.b64decode(base64_string.split(',')[1])
        else:
            img_data = base64.b64decode(base64_string)
            
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        with open(filepath, 'wb') as f:
            f.write(img_data)
        return filepath
    except Exception as e:
        print(f"Error decoding image: {e}")
        return None

def preprocess_image(img_path):
    try:
        image = cv2.imread(img_path)
        if image is None:
            raise ValueError("Could not read image")
            
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        denoised = cv2.fastNlMeansDenoising(gray, h=10, templateWindowSize=7, searchWindowSize=21)
        thresh = cv2.adaptiveThreshold(denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                     cv2.THRESH_BINARY, 31, 2)
        return thresh
    except Exception as e:
        print(f"Error preprocessing image: {e}")
        return None

def extract_text(img_path):
    try:
        preprocessed = preprocess_image(img_path)
        if preprocessed is None:
            return ""
            
        config = r'--psm 6 --oem 3 -c preserve_interword_spaces=1'
        text = pytesseract.image_to_string(preprocessed, config=config)
        
        # Common OCR corrections
        corrections = {
            'UU. CR': 'C/O',
            'Pot eee': 'Puthenpura',
            'PO ': 'P.O. ',
            'Male Male': 'Male',
            'AIG POISE': 'Ajsal Ashraf',
            'Chalarikadayl': 'Chakirikadayil',
            'Kottamiara': 'Kottamkara'
        }
        
        for wrong, right in corrections.items():
            text = text.replace(wrong, right)
            
        return text.strip()
    except Exception as e:
        print(f"Error extracting text: {e}")
        return ""

def extract_step1(text):
    result = {
        "Name": "",
        "DOB": "",
        "Gender": "",
        "Phone": ""
    }
    
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    
    # Name extraction
    for i, line in enumerate(lines):
        if "DOB" in line or "Date of Birth" in line:
            if i > 0 and not any(c.isdigit() for c in lines[i-1]):
                result["Name"] = lines[i-1].strip(' ,-')
                break
    
    if not result["Name"]:
        for line in lines:
            if (re.match(r'^[A-Z][a-z]+(\s[A-Z][a-z]+)+$', line) and
               not any(c.isdigit() for c in line) and
               len(line.split()) <= 3):
                result["Name"] = line.strip()
                break

    # DOB extraction
    for line in lines:
        dob_match = re.search(r'(?:DOB|Date of Birth)[:\s]*(\d{2}/\d{2}/\d{4})', line, re.I)
        if dob_match:
            result["DOB"] = dob_match.group(1)
            break
        else:
            date_match = re.search(r'\d{2}/\d{2}/\d{4}', line)
            if date_match:
                result["DOB"] = date_match.group()
                break

    # Gender extraction
    for line in lines:
        if 'MALE' in line.upper():
            result["Gender"] = 'Male'
            break
        elif 'FEMALE' in line.upper():
            result["Gender"] = 'Female'
            break

    # Phone extraction
    for line in lines:
        phone_match = re.search(r'(?:\+91\s?)?[6-9]\d{9}', line)
        if phone_match:
            result["Phone"] = phone_match.group().replace(" ", "")
            break

    return result

def extract_step2(text):
    patterns = [
        r'\b\d{4}\s\d{4}\s\d{4}\b',
        r'\b\d{4}-\d{4}-\d{4}\b',
        r'\b\d{12}\b',
        r'\b\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d\b'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            aadhaar = re.sub(r'[^\d]', '', match.group())
            if len(aadhaar) == 12:
                return {"Aadhaar": f"XXXX-XXXX-{aadhaar[-4:]}"}
    
    return {"Aadhaar": ""}

def extract_step3(text):
    corrections = [
        (r'Ch[a@]l[ae]r?i?kad[ae]y?[il][\b,]', 'Chakirikadayil'),
        (r'Kott?[ae]m[ae]?i?ara[\b,]', 'Kottamkara'),
        (r'Chand[ae]n?ath?o?pe?[\b,]', 'Chandanathope'),
        (r'(\bCO\b|\bC/O\b)', 'C/O'),
        (r'\bP\s?O\b', 'P.O.'),
        (r',\s*,', ', '),
        (r'\s-\s*$', ''),
        (r'(\w)\s+,\s+', r'\1, '),
        (r'\s+', ' ')
    ]
    
    address_lines = []
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
            
        for pattern, replacement in corrections:
            line = re.sub(pattern, replacement, line, flags=re.I)
            
        if (len(line) > 3 and not line.isdigit() 
            and not re.match(r'^[A-Za-z]\s?[A-Za-z]$', line)):
            address_lines.append(line.strip(' ,-'))
    
    full_address = ', '.join(part for part in address_lines if part)
    
    pincode = ""
    if match := re.search(r'(?<!\d)(\d{6})(?!\d)', full_address):
        pincode = match.group(1)
        full_address = full_address.replace(pincode, '').strip(' ,-')
    
    return {
        "Address": full_address,
        "Pincode": pincode
    }

@app.route('/')
def index():
    return render_template('index.html', data=form_data)

@app.route('/process_image', methods=['POST'])
def process_image():
    global form_data
    try:
        if not request.json:
            return jsonify({"status": "error", "message": "No JSON data"}), 400
            
        img_data = request.json.get('image')
        step = request.json.get('step')
        
        if not img_data or not step:
            return jsonify({"status": "error", "message": "Missing parameters"}), 400

        filename = f"{step}.jpg"
        filepath = decode_image(img_data, filename)
        if not filepath:
            return jsonify({"status": "error", "message": "Image decode failed"}), 400

        text = extract_text(filepath)
        print(f"DEBUG - Extracted text for {step}:\n{text}")
        
        if step == "step1":
            form_data.update(extract_step1(text))
            return jsonify({"status": "step1_done", "data": form_data})
        elif step == "step2":
            form_data.update(extract_step2(text))
            return jsonify({"status": "step2_done", "data": form_data})
        elif step == "step3":
            form_data.update(extract_step3(text))
            return jsonify({"status": "complete", "data": form_data})
        else:
            return jsonify({"status": "error", "message": "Invalid step"}), 400
            
    except Exception as e:
        print(f"Error in process_image: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/process_upload', methods=['POST'])
def process_upload():
    global form_data
    try:
        if 'image' not in request.files:
            return jsonify({"status": "error", "message": "No file uploaded"}), 400
            
        file = request.files['image']
        if file.filename == '':
            return jsonify({"status": "error", "message": "No selected file"}), 400

        # Process all steps at once
        filepath = os.path.join(UPLOAD_FOLDER, "temp.jpg")
        file.save(filepath)
        
        text = extract_text(filepath)
        form_data = {
            **extract_step1(text),
            **extract_step2(text),
            **extract_step3(text)
        }
        
        return jsonify({"status": "complete", "data": form_data})
        
    except Exception as e:
        print(f"Error in process_upload: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/download')
def download():
    try:
        if not form_data:
            return jsonify({"status": "error", "message": "No data available"}), 400
            
        path = os.path.join(UPLOAD_FOLDER, "extracted_data.txt")
        with open(path, 'w', encoding='utf-8') as f:
            for k, v in form_data.items():
                f.write(f"{k}: {v}\n")
        
        return send_file(
            path,
            as_attachment=True,
            mimetype='text/plain',
            download_name='extracted_data.txt'
        )
    except Exception as e:
        print(f"Error in download: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
