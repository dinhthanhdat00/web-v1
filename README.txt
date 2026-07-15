XTB-SPRINGTEA - REALTIME CHART + BACKTEST

Cách chạy:
1. Giải nén ZIP.
2. Mở index.html bằng Chrome/Edge.
3. Nếu không tải được Binance, chạy start_server.bat hoặc python start_server.py rồi mở http://localhost:8000

Backtest:
- Mở nút Backtest trên thanh công cụ.
- Chọn chiến lược, chiều lệnh, vốn, risk, SL, TP, phí.
- Nhấn Chạy backtest.
- Kết quả gồm tổng lệnh, winrate, PnL, max drawdown và bảng lệnh.

Lưu ý: Backtest chỉ là mô phỏng kỹ thuật trên dữ liệu nến lịch sử, không bao gồm trượt giá/thanh khoản thực tế.
BACKTEST TRỰC TIẾP TRÊN CHART
- Chạy backtest sẽ vẽ mũi tên BUY/SELL và điểm thoát lệnh trực tiếp trên biểu đồ giá.
- Click từng dòng trong bảng lệnh để xem Entry / SL / TP của lệnh đó trên chart.
- Nút Replay trên chart mô phỏng diễn biến từng lệnh theo thứ tự thời gian.

BACKTEST TP THEO FORM RSI
- Lệnh LONG sẽ TP khi RSI EMA9 cắt xuống RSI WMA45, tức tạo form SHORT.
- Lệnh SELL/SHORT sẽ TP khi RSI EMA9 cắt lên RSI WMA45, tức tạo form LONG.
- Stop Loss vẫn dùng theo % cài đặt.

BACKTEST - VÀO LẠI SAU SL
- SHORT dính SL: nếu sau đó RSI vẫn nằm dưới EMA9 thì tự mở lại SHORT. SL mới đặt tại đỉnh cây nến vừa dính SL.
- LONG dính SL: nếu sau đó RSI vẫn nằm trên EMA9 thì tự mở lại LONG. SL mới đặt tại đáy cây nến vừa dính SL.

CẬP NHẬT BACKTEST RANGE + MORE HISTORY
- Backtest hiện tải nhiều dữ liệu lịch sử hơn: 1H/4H khoảng 5000 nến, 12H khoảng 4000 nến, 1D/2D khoảng 3000 nến.
- Có thể chọn khoảng thời gian Backtest từ ngày / đến ngày.
- Có nút nhanh 3M / 6M / 1Y / 2Y / ALL.
- Chỉ các lệnh phát sinh trong khoảng thời gian đã chọn mới được đưa vào kết quả và hiển thị trên chart.


CAP NHAT BASELINE JMA
- Da tich hop chi bao BL/Baseline theo Pine Script nguon nguoi dung cung cap.
- Chi hien thi 2 duong tren chart: BL 50 va BL 200.
- Khong ve marker cat len/cat xuong baseline de giu chart don gian.
- BL 50: JMA length 50, phase 5, power 2, source close.
- BL 200: JMA length 200, phase 0, power 2, source close.


--- Cập nhật nút chụp màn hình chart ---
- Đã thêm nút "Chụp chart" trên thanh công cụ.
- Nút này xuất ảnh PNG để chia sẻ.
- Trên điện thoại/trình duyệt hỗ trợ chia sẻ file, nút sẽ ưu tiên mở chia sẻ trực tiếp.
- Trên máy tính, nút sẽ tự tải file PNG về máy.


Bản sửa lỗi tải chart
- Đã bổ sung lại các phần tử HTML BL 50 / BL 200 khớp với JavaScript.
- Đã thêm cơ chế an toàn để thiếu một phần tử giao diện không làm dừng tải chart.


--- Cài đặt BL tùy chỉnh ---
- Bấm nút "Cài đặt BL" để thay đổi Length, Phase, Power cho BL ngắn và BL dài.
- Mặc định: BL ngắn Length 50, Phase 5, Power 2; BL dài Length 200, Phase 0, Power 2.
- Bấm "Áp dụng" để vẽ lại chart theo thông số mới.
- Bấm "Mặc định 50/200" để khôi phục thông số chuẩn.
- Thông số được lưu trên trình duyệt.


--- Cập nhật theo hướng Turtle-style chart ---
- Hỗ trợ mở chart bằng URL: ?sym=BTC&tf=4h.
- Thêm nút Copy link để chia sẻ đúng mã coin và khung thời gian đang xem.
- Thêm quick symbols BTC/ETH/SOL/BNB/XRP để đổi nhanh.
- Thêm Reset chart và Full màn hình.
- Thêm dải OHLC theo crosshair/nến hiện tại.
- Thêm trạng thái BL: ưu tiên Long/Short/quan sát dựa trên giá, BL ngắn và BL dài.
- Giữ nguyên BL tùy chỉnh, chụp chart, công cụ vẽ và backtest.


Cập nhật vẽ tự do mượt
- Đã thêm công cụ "Tự do" trên thanh vẽ của chart giá.
- Giữ và rê chuột để vẽ nét tay mượt, dùng đường cong làm mịn thay vì nét gãy.
- Nét vẽ vẫn bám theo time + price nên khi zoom hoặc kéo chart vẫn đi theo biểu đồ.
- Công cụ xóa từng nét vẫn xóa được cả nét vẽ tự do.


Cập nhật giao diện toolbar
- Đã thu gọn thanh công cụ phía trên: chữ, nút và ký hiệu nhỏ hơn để nhìn chuyên nghiệp hơn.
- Đã thêm khung thời gian 2H. Hệ thống dùng dữ liệu 1H và gộp 2 nến thành 1 nến 2H.


Nâng cấp chụp ảnh / copy ảnh
- Menu Ảnh gồm 4 lựa chọn: Tải PNG (toàn bộ), Copy ảnh (toàn bộ), Tải PNG (khung chọn), Copy ảnh (khung chọn).
- Copy ảnh dùng clipboard để có thể dán trực tiếp vào Zalo, Facebook, Telegram, Word, Excel... nếu trình duyệt hỗ trợ.
- Với khung chọn, kéo chuột trên vùng chart để lấy đúng phần cần chia sẻ.
- Nhấn ESC để hủy chọn vùng.


Rút gọn nút ảnh
- Chỉ còn 1 nút máy ảnh.
- Bấm vào sẽ tự động copy ảnh toàn bộ chart vào clipboard để dán sang Zalo, Facebook, Telegram, Word...
- Nếu trình duyệt không hỗ trợ copy ảnh trực tiếp, hệ thống sẽ tự tải file PNG về máy làm phương án dự phòng.


Cập nhật giao diện theo yêu cầu
- Ẩn thanh trạng thái giá trị chỉ báo phía trên chart để giao diện gọn hơn.
- Thanh công cụ vẽ chuyển sang dạng hàng dọc, bám sát bên trái màn hình và dùng ký hiệu đơn giản.
- Công cụ vẽ tự do có thể chọn màu đỏ hoặc xanh.


Cập nhật bố cục chart
- Tăng diện tích chart chính.
- Cố định RSI sát phía dưới cùng màn hình.
- Thanh công cụ vẽ dọc có thể cuộn trong phạm vi chart để không bị mất các nút cuối như nút xóa toàn bộ.


Cập nhật bố cục RSI v2
- Đổi bố cục chart sang absolute layout để RSI thật sự ghim sát đáy màn hình.
- Chart chính tự chiếm toàn bộ vùng còn lại phía trên RSI.
- Thanh công cụ vẽ dọc có chiều cao theo chart chính, có cuộn dọc và thu nhỏ nút để luôn thấy được chức năng xóa.


Cập nhật RSI và vẽ tự do
- Ẩn hàng thời gian của chart chính, chỉ giữ trục thời gian ở RSI phía dưới để giao diện sạch hơn.
- Thêm thanh kéo ngang giữa chart chính và RSI để co kéo chiều cao RSI giống TradingView.
- Chiều cao RSI được lưu trong trình duyệt.
- Vẽ tự do bổ sung thêm màu cam bên cạnh đỏ và xanh.


Cập nhật màu Fibonacci
- Các đường Fibo mặc định đổi sang màu trắng, nét mảnh và nét đứt.
- Mức 0.5 đổi sang màu đỏ.
- Mức 0.382 đổi sang màu xanh lá.


Cập nhật giao diện compact đã kiểm tra
- Khung thời gian nằm trên hàng trên cùng, cùng hàng với XTB-SPRINGTEA.
- Chữ và nút được thu nhỏ để gọn hơn.
- Công cụ vẽ nằm cùng hàng với các nút bật/tắt chỉ báo.
- Bộ công cụ vẽ được thu nhỏ.
- Đã bỏ nút Copy link.
- Nút Full màn hình đổi thành ký hiệu ⛶.


Cập nhật Bollinger Bands
- Thêm nút BB20 trên hàng bật/tắt chỉ báo.
- Công thức: Bollinger Bands mặc định chu kỳ 20, độ lệch chuẩn 2.
- Hiển thị 3 đường: Upper, Middle/SMA20 và Lower trên chart giá.
- Có thể bật/tắt bằng nút BB20.


Cập nhật EMA/WMA trên giá
- Thêm ô nhập thông số EMA và WMA trên chart giá.
- Mặc định EMA 9 và WMA 45, có thể đổi trực tiếp trên thanh công cụ rồi bấm OK hoặc nhấn Enter.
- Giá trị nhập được lưu trên trình duyệt và dùng lại khi mở lần sau.
- Backtest chiến lược Giá cắt EMA/WMA sẽ dùng thông số EMA/WMA hiện tại.


Cập nhật EMA/WMA compact
- Nút bật/tắt EMA và WMA trên giá được gộp chung với ô chỉnh chu kỳ.
- Không còn nút OK riêng; sửa số rồi nhấn Enter hoặc rời ô nhập để áp dụng.
- Bấm vào vùng nút ngoài ô số để bật/tắt đường EMA/WMA.


Khôi phục vẽ trên RSI
- Khôi phục công cụ vẽ tự do trên panel RSI.
- Khôi phục công cụ mũi tên trên panel RSI.
- Công cụ xóa từng nét có thể xóa nét vẽ trên RSI.
- Màu vẽ trên RSI dùng chung bộ màu đỏ/xanh/cam với công cụ vẽ tự do.


Cập nhật màu mũi tên trên chart giá
- Công cụ mũi tên trên chart giá dùng chung bộ màu với vẽ tự do.
- Có thể chọn 3 màu: đỏ, xanh, cam trước khi vẽ mũi tên trên giá.


Sửa chức năng xóa toàn bộ
- Nút xóa toàn bộ trên thanh công cụ vẽ giờ xóa đồng thời cả hình vẽ trên chart giá và panel RSI.
- Hộp xác nhận sẽ hiển thị số lượng nét vẽ đang có trên từng vùng.


Cập nhật Fibo
- Nét gióng Fibonacci đổi sang dạng chấm nhỏ, mảnh.
- Vẫn giữ mức 0.5 màu đỏ và mức 0.382 màu xanh lá.


Cập nhật mặc định mở chart
- Khung thời gian mặc định khi mở web là H4.
- Các chỉ báo BL 50 và BL 200 mặc định tắt.
- VWAP mặc định dùng mốc M/tháng.
- RSI14, RSI EMA9 và RSI WMA45 mặc định hiển thị.

Cập nhật chỉnh sửa Fibonacci
- Sau khi vẽ Fibo, tiếp tục chọn công cụ Fibo (F), đưa chuột vào chấm tròn điểm đầu hoặc điểm cuối rồi kéo để điều chỉnh lại vị trí.
- Điểm đầu/cuối vẫn lưu theo time/logical + price nên khi kéo chart hoặc phóng to/thu nhỏ, Fibo vẫn bám đúng vị trí tương đối.
