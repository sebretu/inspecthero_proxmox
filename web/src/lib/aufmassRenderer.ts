
export async function renderAnnotatedImage(photoUrl: string, shapes: any[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Draw shapes
      shapes.forEach(shape => {
        ctx.strokeStyle = shape.color || '#ef4444';
        ctx.fillStyle = shape.color || '#ef4444';
        ctx.lineWidth = shape.strokeWidth || 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (shape.type === 'pen' || shape.type === 'line') {
          if (shape.points && shape.points.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(shape.points[0], shape.points[1]);
            for (let i = 2; i < shape.points.length; i += 2) {
              ctx.lineTo(shape.points[i], shape.points[i+1]);
            }
            ctx.stroke();
          }
        } else if (shape.type === 'arrow') {
          if (shape.points && shape.points.length >= 4) {
            const [x1, y1, x2, y2] = shape.points;
            drawArrow(ctx, x1, y1, x2, y2, shape.strokeWidth || 2);
          }
        } else if (shape.type === 'rect') {
          ctx.strokeRect(shape.x, shape.y, shape.width || 0, shape.height || 0);
        } else if (shape.type === 'circle') {
          ctx.beginPath();
          ctx.arc(shape.x, shape.y, shape.radius || 0, 0, Math.PI * 2);
          ctx.stroke();
        } else if (shape.type === 'text') {
          ctx.font = `${20}px Inter, sans-serif`;
          ctx.fillText(shape.text || "", shape.x, shape.y + 20);
        } else if (shape.type === 'marker') {
           // Draw marker circle
           ctx.beginPath();
           ctx.arc(shape.x, shape.y, 15, 0, Math.PI * 2);
           ctx.fill();
           ctx.strokeStyle = 'white';
           ctx.lineWidth = 2;
           ctx.stroke();
           // Draw number
           ctx.fillStyle = 'white';
           ctx.font = 'bold 14px Inter, sans-serif';
           ctx.textAlign = 'center';
           ctx.textBaseline = 'middle';
           ctx.fillText(shape.text || "!", shape.x, shape.y);
        } else if (shape.type === 'measurement') {
           if (shape.points && shape.points.length >= 4) {
             const [x1, y1, x2, y2] = shape.points;
             ctx.setLineDash([10, 10]);
             ctx.beginPath();
             ctx.moveTo(x1, y1);
             ctx.lineTo(x2, y2);
             ctx.stroke();
             ctx.setLineDash([]);
             
             const dx = x2 - x1;
             const dy = y2 - y1;
             const dist = Math.sqrt(dx*dx + dy*dy).toFixed(1);
             ctx.font = '14px Inter, sans-serif';
             ctx.fillText(`${dist} px`, (x1+x2)/2, (y1+y2)/2 - 10);
           }
        }
      });

      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = photoUrl;
  });
}

function drawArrow(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, strokeWidth: number) {
  const headLength = 10 + strokeWidth * 2;
  const angle = Math.atan2(toY - fromY, toX - fromX);
  
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}
