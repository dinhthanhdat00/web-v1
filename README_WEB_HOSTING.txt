XTB-SPRINGTEA WEB RELEASE

Đây là bản web tĩnh, có thể chạy trên điện thoại và chia sẻ cho người khác qua hosting HTTPS.

Cách dùng nhanh:
1. Giải nén toàn bộ file zip.
2. Upload toàn bộ thư mục lên hosting tĩnh như Cloudflare Pages, Netlify, Vercel hoặc GitHub Pages.
3. File mở mặc định là index.html.

Lưu ý:
- Cần internet để tải thư viện Lightweight Charts từ CDN và lấy dữ liệu từ Binance.
- Nên dùng HTTPS khi chia sẻ cho người khác.
- Khi dùng trên điện thoại, nên mở bằng Chrome hoặc Safari mới.

Gợi ý triển khai nhanh:
- Cloudflare Pages: tạo project mới > Upload assets > chọn toàn bộ thư mục đã giải nén.
- Netlify: kéo thả toàn bộ thư mục vào trang Deploy của Netlify.
- GitHub Pages: upload mã nguồn lên repo và bật Pages cho nhánh main.

Các file quan trọng:
- index.html
- assets/css/styles.css
- assets/js/app.js
- site.webmanifest



Tối ưu giao diện điện thoại
- Giao diện được tối ưu cho màn hình điện thoại.
- Topbar và toolbar tự xuống hàng hợp lý.
- Ẩn value strip trên điện thoại để tăng diện tích chart.
- Các panel cài đặt và backtest mở theo kiểu gần full-screen trên điện thoại.
- Khung RSI thấp hơn để chart chính hiển thị lớn hơn trên mobile.


Cập nhật mặc định mở chart
- Khung thời gian mặc định khi mở web là H4.
- Các chỉ báo BL 50 và BL 200 mặc định tắt.
- VWAP mặc định dùng mốc M/tháng.
- RSI14, RSI EMA9 và RSI WMA45 mặc định hiển thị.
- Các chỉ báo trên giá EMA, WMA và Bollinger Bands mặc định tắt.
- Người dùng vẫn có thể bật lại thủ công bằng các nút trên toolbar.
