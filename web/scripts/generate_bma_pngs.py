import base64
import io
import re
from PIL import Image, ImageDraw, ImageFont

def create_detector_png(color_rgb, stroke_w=3):
    scale = 4
    size = 120 * scale
    img = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    
    # Outer rect: x=15, y=15, w=90, h=90 (15 to 105)
    draw.rectangle([15*scale, 15*scale, 105*scale, 105*scale], outline=color_rgb, width=int(stroke_w*scale))
    
    # Step pulse in lower-left: 25, 85 H 38 V 65 H 52 V 85
    pulse_pts = [
        (25*scale, 85*scale),
        (38*scale, 85*scale),
        (38*scale, 65*scale),
        (52*scale, 65*scale),
        (52*scale, 85*scale)
    ]
    draw.line(pulse_pts, fill=color_rgb, width=int(stroke_w*scale), joint="curve")
    
    # Arrow 1: 38, 36 to 68, 68
    draw.line([(38*scale, 36*scale), (68*scale, 68*scale)], fill=color_rgb, width=int(stroke_w*scale))
    draw.line([(57*scale, 66*scale), (68*scale, 68*scale), (66*scale, 57*scale)], fill=color_rgb, width=int(stroke_w*scale), joint="curve")
    
    # Arrow 2: 56, 36 to 86, 68
    draw.line([(56*scale, 36*scale), (86*scale, 68*scale)], fill=color_rgb, width=int(stroke_w*scale))
    draw.line([(75*scale, 66*scale), (86*scale, 68*scale), (84*scale, 57*scale)], fill=color_rgb, width=int(stroke_w*scale), joint="curve")
    
    img_final = img.resize((240, 240), Image.Resampling.LANCZOS)
    return img_final

def create_dis_signalgeber_png(stroke_w=3):
    scale = 4
    w = 170 * scale
    h = 120 * scale
    img = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    
    red = (220, 38, 38, 255)
    
    # Detector square 15 to 105
    draw.rectangle([15*scale, 15*scale, 105*scale, 105*scale], outline=red, width=int(stroke_w*scale))
    
    # Step pulse
    pulse_pts = [
        (25*scale, 85*scale),
        (38*scale, 85*scale),
        (38*scale, 65*scale),
        (52*scale, 65*scale),
        (52*scale, 85*scale)
    ]
    draw.line(pulse_pts, fill=red, width=int(stroke_w*scale), joint="curve")
    
    # Arrow 1
    draw.line([(38*scale, 36*scale), (68*scale, 68*scale)], fill=red, width=int(stroke_w*scale))
    draw.line([(57*scale, 66*scale), (68*scale, 68*scale), (66*scale, 57*scale)], fill=red, width=int(stroke_w*scale), joint="curve")
    
    # Arrow 2
    draw.line([(56*scale, 36*scale), (86*scale, 68*scale)], fill=red, width=int(stroke_w*scale))
    draw.line([(75*scale, 66*scale), (86*scale, 68*scale), (84*scale, 57*scale)], fill=red, width=int(stroke_w*scale), joint="curve")
    
    # Horn polygon: 105 45 L 155 20 V 100 L 105 75 Z
    horn_pts = [
        (105*scale, 45*scale),
        (155*scale, 20*scale),
        (155*scale, 100*scale),
        (105*scale, 75*scale),
        (105*scale, 45*scale)
    ]
    draw.line(horn_pts, fill=red, width=int(stroke_w*scale), joint="curve")
    
    # Letter S
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", int(36*scale))
    except:
        font = ImageFont.load_default()
        
    draw.text((130*scale, 60*scale), "S", fill=red, font=font, anchor="mm")
    
    img_final = img.resize((340, 240), Image.Resampling.LANCZOS)
    return img_final

def create_sirene_png(direction="right", stroke_w=2.8):
    scale = 4
    size = 120 * scale
    img = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    red = (220, 38, 38, 255)
    
    if direction == "right":
        pts = [
            (16*scale, 38*scale),
            (38*scale, 38*scale),
            (104*scale, 18*scale),
            (104*scale, 102*scale),
            (38*scale, 82*scale),
            (16*scale, 82*scale),
            (16*scale, 38*scale)
        ]
    elif direction == "left":
        pts = [
            (104*scale, 38*scale),
            (82*scale, 38*scale),
            (16*scale, 18*scale),
            (16*scale, 102*scale),
            (82*scale, 82*scale),
            (104*scale, 82*scale),
            (104*scale, 38*scale)
        ]
    elif direction == "down":
        pts = [
            (38*scale, 16*scale),
            (38*scale, 38*scale),
            (18*scale, 104*scale),
            (102*scale, 104*scale),
            (82*scale, 38*scale),
            (82*scale, 16*scale),
            (38*scale, 16*scale)
        ]
    else: # up
        pts = [
            (38*scale, 104*scale),
            (38*scale, 82*scale),
            (18*scale, 16*scale),
            (102*scale, 16*scale),
            (82*scale, 82*scale),
            (82*scale, 104*scale),
            (38*scale, 104*scale)
        ]
    
    draw.line(pts, fill=red, width=int(stroke_w*scale), joint="curve")
    img_final = img.resize((240, 240), Image.Resampling.LANCZOS)
    return img_final

def create_lampe_png(stroke_w=3.5):
    scale = 4
    size = 100 * scale
    img = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    orange = (249, 115, 22, 255)
    
    # Outer circle cx=50, cy=50, r=40 (10 to 90)
    draw.ellipse([10*scale, 10*scale, 90*scale, 90*scale], outline=orange, width=int(stroke_w*scale))
    
    # Diagonal lines: (21.7, 21.7) to (78.3, 78.3) and (78.3, 21.7) to (21.7, 78.3)
    draw.line([(21.7*scale, 21.7*scale), (78.3*scale, 78.3*scale)], fill=orange, width=int(stroke_w*scale))
    draw.line([(78.3*scale, 21.7*scale), (21.7*scale, 78.3*scale)], fill=orange, width=int(stroke_w*scale))
    
    img_final = img.resize((240, 240), Image.Resampling.LANCZOS)
    return img_final

red_rgb = (220, 38, 38, 255)
blue_rgb = (37, 99, 235, 255)

r_img = create_detector_png(red_rgb)
r_img.save("/home/ubuntu/building-task-manager/web/public/symbols/bma/detector_red.png")

b_img = create_detector_png(blue_rgb)
b_img.save("/home/ubuntu/building-task-manager/web/public/symbols/bma/detector_blue.png")

l_img = create_lampe_png()
l_img.save("/home/ubuntu/building-task-manager/web/public/symbols/bma/lampe.png")

d_img = create_dis_signalgeber_png()
d_img.save("/home/ubuntu/building-task-manager/web/public/symbols/bma/dis_signalgeber.png")

s_r_img = create_sirene_png("right")
s_r_img.save("/home/ubuntu/building-task-manager/web/public/symbols/bma/sirene_right.png")
s_r_img.save("/home/ubuntu/building-task-manager/web/public/symbols/bma/sirene.png")

s_l_img = create_sirene_png("left")
s_l_img.save("/home/ubuntu/building-task-manager/web/public/symbols/bma/sirene_left.png")

s_d_img = create_sirene_png("down")
s_d_img.save("/home/ubuntu/building-task-manager/web/public/symbols/bma/sirene_down.png")

s_u_img = create_sirene_png("up")
s_u_img.save("/home/ubuntu/building-task-manager/web/public/symbols/bma/sirene_up.png")

def to_b64(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

r_b64 = to_b64(r_img)
b_b64 = to_b64(b_img)
l_b64 = to_b64(l_img)
d_b64 = to_b64(d_img)
sr_b64 = to_b64(s_r_img)
sl_b64 = to_b64(s_l_img)
sd_b64 = to_b64(s_d_img)
su_b64 = to_b64(s_u_img)

# Update bmaSymbolsData.ts
ts_path = "/home/ubuntu/building-task-manager/web/src/lib/bmaSymbolsData.ts"
with open(ts_path, "r", encoding="utf-8") as f:
    content = f.read()

def update_key(content, key, val):
    pattern = rf'({key}:\s*")[^"]+(")'
    if re.search(pattern, content):
        content = re.sub(pattern, rf'\g<1>{val}\g<2>', content)
    else:
        content = content.replace('BMA_ICONS_BASE64: Record<string, string> = {', f'BMA_ICONS_BASE64: Record<string, string> = {{\n  {key}: "{val}",')
    return content

content = update_key(content, 'detector_red', r_b64)
content = update_key(content, 'detector_blue', b_b64)
content = update_key(content, 'lampe', l_b64)
content = update_key(content, 'dis_signalgeber', d_b64)
content = update_key(content, 'sirene', sr_b64)
content = update_key(content, 'sirene_right', sr_b64)
content = update_key(content, 'sirene_left', sl_b64)
content = update_key(content, 'sirene_down', sd_b64)
content = update_key(content, 'sirene_up', su_b64)

with open(ts_path, "w", encoding="utf-8") as f:
    f.write(content)

print("SUCCESSFULLY GENERATED PNGS AND UPDATED bmaSymbolsData.ts")

