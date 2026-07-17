THÀNH ĐẠT TRADING DASHBOARD

Dashboard web tĩnh hỗ trợ phân tích BTC theo phong cách swing trading đa khung thời gian, tập trung vào price action và bộ chỉ báo RSI14 + EMA9 + WMA45.

Mục tiêu:
- Tạo một không gian phân tích gọn, nhanh, dễ nhìn.
- Hỗ trợ lập kế hoạch giao dịch BTC trên các khung H4/H12.
- Tập trung vào BTC, không lan man sang nhiều cặp giao dịch khác.

Tính năng chính:
- Theo dõi realtime BTCUSDT bằng dữ liệu từ Binance.
- Chart: xem nhanh H4, H12, D1, D2 theo chart giá.
- Single: một chart lớn có thể đổi timeframe H1, H4, H12, D1, D2, D3, W.
- RSI Only: so sánh RSI14 + EMA9 + WMA45 trên nhiều khung thời gian.
- Baseline nhanh/chậm trên chart giá.
- VWAP tuần và VWAP tháng.
- Volume.
- Marker P2/P3 theo logic RSI.
- Nền xanh/đỏ theo regime RSI.
- Countdown thời gian đóng nến.
- Điều chỉnh chiều cao khung RSI trong Single.
- Vẽ trendline trong Single chart.
- Crosshair đồng bộ giữa chart giá và RSI.
- Tối ưu hiệu năng: chỉ render tab đang xem, giảm redraw WebSocket, debounce resize.

Cách sử dụng nhanh:
1. Mở trang web.
2. Nhập symbol, mặc định là BTCUSDT.
3. Chọn Chart, Single hoặc RSI Only.
4. Trong Controls, bật/tắt các layer cần xem.
5. Trong Single, có thể vẽ trendline và điều chỉnh chiều cao RSI.

Khung thời gian hỗ trợ:
- Single: H1, H4, H12, D1, D2, D3, W.
- Chart và RSI Only: H4, H12, D1, D2.

Chạy local:
Nếu mở trực tiếp index.html bị trình duyệt chặn kết nối API, hãy chạy:

python start_server.py

Sau đó mở:

http://localhost:8000

Hoặc chạy:

start_server.bat

Lưu ý:
- Đây là công cụ hỗ trợ phân tích, không phải lời khuyên tài chính.
- Dữ liệu lấy từ Binance và có thể bị chậm hoặc lỗi tạm thời tùy kết nối.
- Phương pháp giao dịch, ghi chú riêng và các reference cá nhân không nằm trong repository này.

Thương hiệu:
Thành Đạt - Hành trình trade để tự do tài chính.
