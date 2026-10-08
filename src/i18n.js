/**
 * English and Vietnamese. The app is written in English; in Vietnamese every
 * piece of text on the page (and the aria-label and title of anything) is
 * looked up here and swapped in place, including whatever the app writes
 * later, which a MutationObserver catches as it lands. Back in English the
 * originals are put back. So the app's code never asks for a translation.
 *
 * Text is matched whole, whitespace collapsed: first in the scoped table for
 * the nearest element with an id (one word, two meanings), then the plain
 * table, then the patterns for text with names or numbers in it. Anything
 * not found stays English, as do elements marked translate="no".
 */
const VI = {
  // Page, top bar and welcome
  "Virtual Grand Piano — Interactive 3D Piano":
    "Virtual Grand Piano — Đàn piano 3D tương tác",
  "Interactive instrument": "Nhạc cụ tương tác",
  "Interactive 88-key concert grand": "Đàn grand 88 phím tương tác",
  "A concert grand on a gilded Viennese stage. Play it, take it apart, or listen from the stalls.":
    "Một cây đại dương cầm trên sân khấu mạ vàng kiểu Viên. Hãy chơi đàn, tháo rời để xem bên trong, hoặc ngồi nghe từ hàng ghế khán giả.",
  "Enter the hall": "Vào khán phòng",
  "Preparing piano…": "Đang chuẩn bị đàn…",
  "Keyboard, touch, or MIDI · best with headphones":
    "Bàn phím, cảm ứng, MIDI · nên dùng tai nghe",
  "The 3D piano could not start. Check your connection and WebGL support, then retry.":
    "Không khởi động được đàn 3D. Hãy kiểm tra kết nối mạng và WebGL rồi thử lại.",
  "Retry piano": "Thử lại",
  Ready: "Sẵn sàng",
  "Larger text and buttons": "Chữ và nút lớn hơn",
  "Key letters": "Chữ trên phím",
  "Show the computer keys on the piano keys":
    "Hiện phím máy tính tương ứng trên phím đàn",
  "Hide HUD": "Ẩn menu",
  "Show HUD": "Hiện menu",
  "Piano controls": "Điều khiển đàn",
  "Piano performance surface": "Bề mặt chơi đàn",
  Menu: "Menu",
  Listen: "Nghe",
  Explore: "Khám phá",
  Hall: "Khán phòng",
  Games: "Trò chơi",
  Help: "Trợ giúp",
  Close: "Đóng",

  // Play
  "Play the piano": "Chơi đàn",
  "Tap the keys, or use your computer keyboard: Z X C and Q W E.":
    "Chạm vào phím đàn, hoặc dùng bàn phím máy tính: Z\u00a0X\u00a0C và Q\u00a0W\u00a0E.",
  "Keyboard range": "Âm vực bàn phím",
  "Computer keyboard range": "Âm vực bàn phím máy tính",
  "Lower keyboard octave": "Hạ một quãng tám",
  "Raise keyboard octave": "Nâng một quãng tám",
  Lower: "Thấp hơn",
  Higher: "Cao hơn",
  "Record yourself": "Thu âm phần bạn chơi",
  Record: "Thu âm",
  "Start recording": "Bắt đầu thu",
  Recording: "Đang thu",
  "Play recording": "Nghe lại",
  "Stop playback": "Dừng nghe lại",
  "Playing recording": "Đang phát bản thu",
  "Save audio": "Lưu âm thanh",
  "Download the last take as an audio file":
    "Tải bản thu gần nhất thành tệp âm thanh",
  "MIDI keyboard": "Đàn MIDI",
  "Connect MIDI": "Kết nối MIDI",
  "MIDI input": "Đầu vào MIDI",
  "Select MIDI input…": "Chọn đầu vào MIDI…",
  "Select MIDI device": "Chọn thiết bị MIDI",
  "No MIDI devices": "Không có thiết bị MIDI",
  "MIDI permission denied": "MIDI chưa được cấp quyền",
  "MIDI unavailable": "Không dùng được MIDI",
  "Loading piano…": "Đang tải đàn…",
  "Piano ready": "Đàn đã sẵn sàng",
  "Piano ready · fallback audio": "Đàn đã sẵn sàng · âm thanh dự phòng",
  "Audio could not start": "Không bật được âm thanh",

  // Listen
  "Listen to a piece": "Nghe một bản nhạc",
  "Choose a piece and press Play.": "Chọn bản nhạc rồi bấm Phát.",
  Piece: "Bản nhạc",
  "Choose a piece": "Chọn bản nhạc",
  "Play the selected piece": "Phát bản nhạc đã chọn",
  Play: "Phát",
  Stop: "Dừng",
  Watch: "Xem",
  Cinematic: "Xem như phim",
  "Plays the piece as a film of the hall":
    "Phát bản nhạc như một bộ phim về khán phòng",
  Programme: "Chương trình",
  "Or click any seat in the hall": "Hoặc bấm vào ghế bất kỳ trong khán phòng",
  "Learn it": "Tập chơi",
  "Practice mode": "Chế độ tập",
  "Just listen": "Chỉ nghe",
  "Practice: both hands": "Tập: hai tay",
  "Practice: right hand": "Tập: tay phải",
  "Practice: left hand": "Tập: tay trái",
  Tempo: "Tốc độ",
  "Your own music": "Nhạc của bạn",
  "Open MIDI file…": "Mở tệp MIDI…",
  "Or drop a .mid file anywhere": "Hoặc thả tệp .mid vào bất kỳ đâu",
  "Drop a MIDI file to play it": "Thả tệp MIDI vào để phát",
  "Your MIDI file": "Tệp MIDI của bạn",
  "Exit cinema (Esc)": "Thoát xem phim (Esc)",
  "Skip to the piano": "Bỏ qua, đến chỗ đàn",
  "Virtual Grand Piano · The Gilded Hall":
    "Virtual Grand Piano · Khán phòng Mạ vàng",
  "Close the programme": "Đóng tờ chương trình",
  "Kindly silence your telephones. Pick a piece to hear it from the stage.":
    "Xin quý khách tắt chuông điện thoại. Chọn một bản nhạc để nghe từ sân khấu.",
  "Composed in 1810 and published only in 1867, forty years after Beethoven’s death, from a manuscript that has since been lost.":
    "Sáng tác năm 1810 nhưng đến năm 1867 mới được xuất bản, bốn mươi năm sau khi Beethoven qua đời, từ một bản thảo nay đã thất lạc.",
  "The melody of the choral finale of the Ninth Symphony, first performed in Vienna in 1824.":
    "Giai điệu chương hợp xướng cuối của Giao hưởng số 9, trình diễn lần đầu tại Viên năm 1824.",
  "A ground bass of eight notes repeats beneath the whole piece while the upper voice unfolds ever more elaborate variations: half notes, quarters, rippling eighths, then two voices in sixths.":
    "Một bè trầm tám nốt lặp lại suốt bản nhạc, trong khi bè trên mở ra những biến tấu ngày càng cầu kỳ: nốt trắng, nốt đen, chuỗi móc đơn lăn tăn, rồi hai bè song song quãng sáu.",
  "Amazing Grace — melody": "Amazing Grace — dân ca Mỹ",
  "Amazing Grace — Traditional American melody":
    "Amazing Grace — giai điệu dân gian Mỹ",
  "Traditional American melody · words by John Newton (1779)":
    "Giai điệu dân gian Mỹ · lời John Newton (1779)",
  "The first prelude of The Well-Tempered Clavier (1722).":
    "Bản prelude đầu tiên trong tập The Well-Tempered Clavier (1722).",
  "John Newton’s words were published in Olney Hymns (1779); the tune “New Britain” appeared in 1829.":
    "Lời của John Newton được in trong tập Olney Hymns (1779); giai điệu “New Britain” ra đời năm 1829.",

  // Explore
  "Explore the piano": "Khám phá cây đàn",
  "Take it apart to see inside, then tap a part to learn its name.":
    "Tách rời đàn để xem bên trong, rồi chạm vào một bộ phận để biết tên.",
  "Look inside": "Xem bên trong",
  "Inspection mode": "Chế độ xem",
  Normal: "Bình thường",
  Exploded: "Tách rời",
  "Close lid": "Đóng nắp",
  "Open lid": "Mở nắp",
  "Close fallboard": "Đóng nắp phím",
  "Open fallboard": "Mở nắp phím",
  Camera: "Góc nhìn",
  "Camera view": "Góc nhìn",
  "Pianist view": "Góc người chơi",
  "Keyboard close-up": "Cận cảnh phím đàn",
  "Front row": "Hàng ghế đầu",
  Balcony: "Ban công",
  "Whole hall": "Toàn khán phòng",
  "Free cam": "Camera tự do",
  "Reset view": "Đặt lại góc nhìn",
  "Piano finish": "Lớp sơn đàn",
  Black: "Đen bóng",
  Ivory: "Trắng ngà",
  Walnut: "Gỗ óc chó",
  "Gold leaf": "Dát vàng",
  "↑ ↓ walk, ← → turn. Hold Shift with ↑ ↓ to rise and descend (or PageUp / PageDown), with ← → to step sideways. Drag to look around.":
    "↑ ↓ để đi, ← → để xoay. Giữ Shift cùng ↑ ↓ để lên xuống (hoặc PageUp / PageDown), cùng ← → để bước sang ngang. Kéo để nhìn quanh.",

  // Hall
  "The concert hall": "Khán phòng",
  "Set the stage, the guests and the light, or roll the credits.":
    "Bày sân khấu, khán giả và ánh sáng, hoặc chạy danh đề cuối.",
  Stage: "Sân khấu",
  "Close curtain": "Kéo rèm",
  "Open curtain": "Mở rèm",
  Audience: "Khán giả",
  "Low and Medium graphics start without them":
    "Đồ họa Thấp và Vừa bắt đầu khi chưa có khán giả",
  "Closing credits": "Danh đề cuối",
  "Light and detail": "Ánh sáng và chi tiết",
  "Daylight outside": "Trời bên ngoài",
  "Sky: your clock": "Trời: theo giờ của bạn",
  "Sky: day": "Trời: ban ngày",
  "Sky: sunset": "Trời: hoàng hôn",
  "Sky: night": "Trời: ban đêm",
  "Graphics quality": "Chất lượng đồ họa",
  "Graphics: Low": "Đồ họa: Thấp",
  "Graphics: Medium": "Đồ họa: Vừa",
  "Graphics: High": "Đồ họa: Cao",
  "Graphics: Ultra": "Đồ họa: Tối đa",

  // Games
  "Games about the piano, in the salon and round the hall. Esc brings you back.":
    "Trò chơi về cây đàn, trong phòng salon và quanh khán phòng. Bấm Esc để quay lại.",
  "Falling notes": "Nốt rơi",
  "Press each key just as its light lands on it.":
    "Bấm mỗi phím đúng lúc vệt sáng chạm vào nó.",
  "Piece for Falling notes": "Bản nhạc cho Nốt rơi",
  "Falling notes level": "Mức độ Nốt rơi",
  "Easy: right hand, slower": "Dễ: tay phải, chậm hơn",
  "Normal: right hand": "Vừa: tay phải",
  "Hard: both hands": "Khó: hai tay",
  "Or play your own MIDI file…": "Hoặc chơi tệp MIDI của bạn…",
  "Play Falling notes": "Chơi Nốt rơi",
  Echo: "Tiếng vọng",
  "Listen to a little tune, then play it back. It grows a note each round.":
    "Nghe một giai điệu ngắn rồi chơi lại. Mỗi vòng thêm một nốt.",
  "Echo level": "Mức độ Tiếng vọng",
  "Easy: 5 notes, 3 lives": "Dễ: 5 nốt, 3 mạng",
  "Normal: 8 notes, 2 lives": "Vừa: 8 nốt, 2 mạng",
  "Hard: 12 notes, 1 life": "Khó: 12 nốt, 1 mạng",
  "Play Echo": "Chơi Tiếng vọng",
  Game: "Trò chơi",
  Score: "Điểm",
  Combo: "Chuỗi",
  "Leave game (Esc)": "Rời trò chơi (Esc)",
  "Both hands: press each key as its light lands.":
    "Hai tay: bấm mỗi phím đúng lúc vệt sáng chạm xuống.",
  "Right hand: press each key as its light lands. The piano plays the rest.":
    "Tay phải: bấm mỗi phím đúng lúc vệt sáng chạm xuống. Đàn sẽ chơi phần còn lại.",
  "Go!": "Bắt đầu!",
  "Perfect!": "Hoàn hảo!",
  Good: "Tốt",
  Miss: "Trượt",
  Notes: "Số nốt",
  Lives: "Mạng",
  "Listen…": "Nghe nào…",
  "Your turn!": "Đến lượt bạn!",
  "Great!": "Giỏi lắm!",
  "Oh!": "Ôi!",
  "Oops! Listen again": "Ối! Nghe lại nhé",
  Accuracy: "Độ chính xác",
  "Perfect / Good": "Hoàn hảo / Tốt",
  "Best combo": "Chuỗi dài nhất",
  "Your best": "Kỷ lục của bạn",
  "New best!": "Kỷ lục mới!",
  "Tune remembered": "Giai điệu nhớ được",
  "Not yet": "Chưa có",
  "Keep practising!": "Tập thêm nhé!",
  "Well played!": "Chơi hay lắm!",
  "Bravo!": "Hoan hô!",
  "Magnificent!": "Xuất sắc!",
  "Play again": "Chơi lại",
  // The treasure hunt
  "Composers' treasures": "Báu vật nhà soạn nhạc",
  "Eight great composers each left a keepsake somewhere in the hall and the salon. Can you find them all?":
    "Tám nhà soạn nhạc lừng danh, mỗi người để quên một kỷ vật đâu đó trong khán phòng và phòng salon. Bạn tìm được hết không?",
  "Start the hunt": "Bắt đầu tìm",
  "Carry on the hunt": "Tìm tiếp",
  "Hide them again": "Giấu lại từ đầu",
  "Treasure hunt": "Tìm báu vật",
  Found: "Đã tìm",
  "Show me": "Chỉ đường",
  "Go to the salon": "Sang phòng salon",
  "Leave hunt (Esc)": "Thôi tìm (Esc)",
  "Keep looking": "Tìm tiếp",
  "W A S D or the arrow keys to walk, Shift to hurry, drag to look about. Go up close to a treasure and click it.":
    "W A S D hoặc phím mũi tên để đi, Shift để đi nhanh, kéo chuột để nhìn quanh. Lại gần báu vật rồi bấm vào nó.",
  "The stick walks, a drag looks about. Go up close to a treasure and tap it.":
    "Cần điều khiển để đi, vuốt màn hình để nhìn quanh. Lại gần báu vật rồi chạm vào nó.",
  "Come closer to pick it up.": "Lại gần hơn để nhặt nhé.",
  // What to look for…
  "someone left a cup of coffee.": "có ai để quên tách cà phê.",
  "something is ticking.": "có thứ gì đang tích tắc.",
  "a pair of white gloves was dropped.": "có đôi găng tay trắng bị đánh rơi.",
  "a flute waits for its player.": "một cây sáo đang chờ người thổi.",
  "a horn for listening lies forgotten.": "một chiếc tù và để nghe bị bỏ quên.",
  "a little dog sits quietly.": "một chú chó nhỏ ngồi im.",
  "the moon came down to rest.": "vầng trăng đã xuống nghỉ.",
  "someone has lost their glasses.": "ai đó làm rơi cặp kính.",
  // …and where.
  "On the gilded ledge below the organ pipes, on the left:":
    "Trên gờ mạ vàng dưới dàn ống organ, phía bên trái:",
  "On the gilded ledge below the organ pipes, on the right:":
    "Trên gờ mạ vàng dưới dàn ống organ, phía bên phải:",
  "On the steps up to the stage:": "Trên bậc thang lên sân khấu:",
  "At the front of the stage, on the left:": "Ở mép trước sân khấu, bên trái:",
  "At the back of the stage, on the right:": "Ở phía sau sân khấu, bên phải:",
  "In front of the first row, on the left:": "Trước hàng ghế đầu, bên trái:",
  "At the very back of the centre aisle, by the doors:":
    "Cuối lối đi giữa, sát cửa ra vào:",
  "Along the left wall, under the balcony:":
    "Dọc tường bên trái, dưới ban công:",
  "Along the right wall, under the balcony:":
    "Dọc tường bên phải, dưới ban công:",
  "Up the stairs at the back, on the left balcony:":
    "Lên cầu thang cuối khán phòng, trên ban công bên trái:",
  "Up the stairs at the back, on the right balcony:":
    "Lên cầu thang cuối khán phòng, trên ban công bên phải:",
  "In the salon, up on the mantelpiece:": "Trong phòng salon, trên bệ lò sưởi:",
  "In the salon, under the window nearer the fire:":
    "Trong phòng salon, dưới ô cửa sổ gần lò sưởi:",
  "In the salon, under the window farther from the fire:":
    "Trong phòng salon, dưới ô cửa sổ xa lò sưởi:",
  "In the salon, in the corner behind the pianist:":
    "Trong phòng salon, ở góc phòng sau lưng người chơi đàn:",
  "In the salon, on the floor beside the fireplace:":
    "Trong phòng salon, trên sàn cạnh lò sưởi:",
  "You found every treasure. Bravo!": "Bạn đã tìm thấy mọi báu vật. Hoan hô!",
  "Bach's coffee cup": "Tách cà phê của Bach",
  "Haydn's pocket watch": "Đồng hồ bỏ túi của Haydn",
  "Liszt's white gloves": "Đôi găng trắng của Liszt",
  "Mozart's magic flute": "Cây sáo thần của Mozart",
  "Beethoven's ear trumpet": "Tù và trợ thính của Beethoven",
  "Chopin's little dog": "Chú chó nhỏ của Chopin",
  "Debussy's moon": "Vầng trăng của Debussy",
  "Schubert's spectacles": "Cặp kính của Schubert",
  "Bach loved coffee so much that he wrote a little comic opera about it, the Coffee Cantata, around 1734.":
    "Bach mê cà phê đến mức viết hẳn một vở nhạc kịch hài nhỏ về nó, bản Cantata Cà phê, khoảng năm 1734.",
  "Haydn's Symphony No. 101 is nicknamed The Clock, for the steady tick-tock that runs through its slow movement.":
    "Giao hưởng số 101 của Haydn có biệt danh Đồng hồ, vì tiếng tích tắc đều đặn chạy suốt chương chậm.",
  "It is told that Liszt peeled off his white gloves and dropped them on the floor before he played, and admirers rushed to keep them.":
    "Người ta kể Liszt thường tháo đôi găng trắng thả xuống sàn trước khi chơi đàn, và người hâm mộ tranh nhau giữ lấy.",
  "Mozart's last opera, The Magic Flute (1791), is about a flute that turns danger into dance.":
    "Vở opera cuối cùng của Mozart, Cây sáo thần (1791), kể về cây sáo biến hiểm nguy thành điệu múa.",
  "As he grew deaf, Beethoven used ear trumpets made by Johann Mälzel, who also made the metronome, and he kept on composing.":
    "Khi tai dần điếc, Beethoven dùng tù và trợ thính do Johann Mälzel, người làm ra máy đếm nhịp, chế tạo, và ông vẫn tiếp tục sáng tác.",
  "Chopin's Minute Waltz is also called the Waltz of the Little Dog: George Sand's dog, chasing its own tail.":
    "Điệu Valse Một phút của Chopin còn gọi là Valse Chú chó nhỏ: chú chó của George Sand đuổi theo cái đuôi của mình.",
  "Clair de lune, moonlight, is the best-loved piece of Debussy's Suite bergamasque.":
    "Clair de lune, Ánh trăng, là khúc được yêu thích nhất trong tổ khúc Suite bergamasque của Debussy.",
  "Schubert is said to have slept with his glasses on, so he could start writing music the moment he woke.":
    "Người ta kể Schubert ngủ mà vẫn đeo kính, để vừa thức dậy là viết nhạc được ngay.",
  "Back to the hall": "Về khán phòng",

  // Help
  "Controls guide": "Hướng dẫn điều khiển",
  "Close controls guide": "Đóng hướng dẫn",
  Controls: "Điều khiển",
  and: "và",
  "play notes.": "để chơi nốt.",
  "sustains.": "để ngân tiếng.",
  "shifts octaves.": "để đổi quãng tám.",
  Touch: "Cảm ứng",
  "Tap or drag across keys. Drag away from the keyboard to orbit; pinch or scroll to zoom.":
    "Chạm hoặc vuốt qua các phím. Kéo ngoài bàn phím để xoay góc nhìn; chụm hai ngón hoặc cuộn để phóng to.",
  "Connect an input when you want one. Sustain pedal CC64 is supported.":
    "Kết nối đàn MIDI khi bạn cần. Có hỗ trợ pedal ngân CC64.",
  View: "Góc nhìn",
  "Drag to orbit, right-drag or two fingers to pan, scroll to zoom toward the cursor. Double-click any spot to orbit around it. In Exploded mode, pick a part’s name to fly to it. With":
    "Kéo để xoay, kéo chuột phải hoặc hai ngón để dịch, cuộn để phóng to về phía con trỏ. Bấm đúp vào một điểm để xoay quanh điểm đó. Ở chế độ Tách rời, chọn tên một bộ phận để bay tới. Khi bật",
  "on,": ",",
  "walk and": "để đi và",
  "turn; hold": "để xoay; giữ",
  with: "cùng",
  "to rise and descend (or": "để lên xuống (hoặc",
  "), with": "), cùng",
  "to step sideways.": "để bước sang ngang.",

  // The inspector and the piano's parts
  "Piano anatomy": "Cấu tạo đàn",
  "Try Z X C, and Space to sustain. Tap or drag across keys. After using controls, click the piano or Tab to its performance surface to play with your keyboard.":
    "Thử Z\u00a0X\u00a0C, và Space để ngân tiếng. Chạm hoặc vuốt qua các phím. Sau khi dùng các nút, bấm vào đàn hoặc Tab tới bề mặt đàn để chơi bằng bàn phím.",
  "Try Z X C, and Space to sustain. Tap or drag across keys, or select a part to explore the instrument.":
    "Thử Z\u00a0X\u00a0C, và Space để ngân tiếng. Chạm hoặc vuốt qua các phím, hoặc chọn một bộ phận để khám phá cây đàn.",
  "Piano component": "Bộ phận của đàn",
  "Individually modeled grand-piano component.":
    "Một bộ phận của đàn grand, được dựng riêng.",
  "Exploded inspection": "Xem tách rời",
  "Selected component": "Bộ phận đã chọn",
  "Exploded anatomy": "Cấu tạo tách rời",
  "Major piano systems are spatially separated while remaining individually selectable and orbitable.":
    "Các phần chính của đàn được tách ra, vẫn chọn và xoay quanh được từng phần.",
  "Rim & case": "Vành & thân đàn",
  Soundboard: "Bảng cộng hưởng",
  "Cast plate": "Khung gang",
  Strings: "Dây đàn",
  Action: "Bộ máy búa",
  "Music desk": "Giá nhạc",
  Lid: "Nắp đàn",
  Keyboard: "Bàn phím",
  "Pedal lyre": "Giá pedal",
  "Legs & casters": "Chân & bánh xe",
  Exterior: "Bên ngoài",
  Acoustics: "Âm học",
  Structure: "Kết cấu",
  Support: "Nâng đỡ",
  Interface: "Giao diện chơi",
  "Artist bench": "Ghế nghệ sĩ",
  "Lacquered rim & case": "Vành & thân đàn sơn mài",
  "A hollow curved rim forms the structural case: a thin glossy wall around an open cavity, a keybed at the front, and a dark inner floor. It holds the soundboard under crown and resists the strings’ cumulative tension.":
    "Vành cong rỗng tạo nên thân đàn: một thành mỏng bóng bao quanh khoang hở, mặt đỡ phím phía trước và đáy trong màu tối. Vành giữ bảng cộng hưởng ở độ vồng và chịu tổng lực căng của các dây.",
  "Spruce soundboard": "Bảng cộng hưởng gỗ vân sam",
  "A thin spruce diaphragm fills the cavity below the cast frame, ribbed underneath and carrying a curved bridge on top. It turns string vibration into the instrument’s broad acoustic output.":
    "Một tấm gỗ vân sam mỏng phủ kín khoang dưới khung gang, có gân bên dưới và cầu ngựa cong bên trên. Nó biến rung động của dây thành âm thanh vang rộng của cây đàn.",
  "Cast-iron plate / harp": "Khung gang / khung đàn hạc",
  "An open structural cast frame with a thick perimeter, pinblock web, five tapered braces, raised window bosses and a heavy tail rail. Large openings keep the spruce soundboard visibly active beneath the string field.":
    "Khung đúc hở chịu lực với viền dày, vách khối chốt, năm thanh giằng thon, gờ cửa sổ nổi và thanh đuôi nặng. Các ô trống lớn để lộ bảng cộng hưởng gỗ vân sam bên dưới dàn dây.",
  "Tuning-pin block": "Khối chốt lên dây",
  "Hammer action & dampers": "Bộ máy búa & bộ chặn tiếng",
  "Eighty-eight aligned actions show capstans, wippens, pivoting hammer shanks and individual dampers through B6. The undamped C7–C8 treble follows normal grand-piano practice.":
    "Tám mươi tám bộ máy thẳng hàng cho thấy núm đẩy, cần nâng, cán búa xoay và bộ chặn tiếng riêng cho từng phím đến B6. Dải cao C7–C8 không có bộ chặn tiếng, đúng như đàn grand thật.",
  "Legs & brass casters": "Chân đàn & bánh xe đồng",
  "Three square tapered legs carry the case above the stage — two under the key bottom and one beneath the tail — each shod in a brass ferrule over a twin-wheel brass caster.":
    "Ba chân vuông vuốt thon nâng thân đàn trên sân khấu — hai chân dưới đầu phím, một chân dưới đuôi — mỗi chân bọc đai đồng trên bánh xe đôi bằng đồng.",
  "Three pedals — soft, sostenuto and sustain — mounted on the decorative lyre that hangs centred beneath the keyboard and faces the player.":
    "Ba pedal — giảm âm, sostenuto và ngân — gắn trên giá pedal trang trí treo chính giữa dưới bàn phím, hướng về người chơi.",
  "Soft pedal": "Pedal giảm âm",
  "Sostenuto pedal": "Pedal sostenuto",
  "Sustain pedal": "Pedal ngân",
  "Hold to lift the dampers and sustain released notes.":
    "Giữ để nhấc bộ chặn tiếng, cho các nốt đã thả tiếp tục ngân.",
  "Cheek block": "Khối má đàn",
  Fallboard: "Nắp phím",
  "Grand-piano lid": "Nắp đàn grand",
  "A thin lacquered lid matching the case outline, hinged along the bass-side spine and held open by a prop stick to project sound toward the audience.":
    "Nắp sơn mài mỏng theo đúng đường viền thân đàn, bản lề dọc cạnh bè trầm và được cây chống giữ mở để đưa âm thanh về phía khán giả.",
  "Music desk & score": "Giá nhạc & bản nhạc",
  "An engraved edition of the selected piece on the music rack. Click the right page to turn forward, the left page to turn back; autoplay follows this score.":
    "Bản in của bản nhạc đã chọn trên giá nhạc. Bấm trang phải để lật tới, trang trái để lật lại; khi tự chơi, bản nhạc sẽ tự lật theo.",
  "Routed string field & tuning system": "Dàn dây & hệ thống lên dây",
  "Each representative string follows one straight plan-view trajectory through its tuning pin, front bearing, bridge crown and matched hitch pin. Bass strings form a coherent raised crossover family; tenor pairs and treble trichords remain restrained steel-grey.":
    "Mỗi dây đi theo một đường thẳng qua chốt lên dây, điểm tựa trước, đỉnh cầu ngựa và chốt móc tương ứng. Dây bè trầm bắt chéo phía trên thành một nhóm; cặp dây giọng giữa và bộ ba dây bè cao giữ màu xám thép.",
  "88-key keyboard": "Bàn phím 88 phím",
  "Full 88-key geometry from A0 to C8. A central range maps to the computer keyboard; every visible key is mouse/touch playable.":
    "Đủ 88 phím từ A0 đến C8. Một dải giữa được gán cho bàn phím máy tính; phím nào nhìn thấy cũng chơi được bằng chuột hoặc cảm ứng.",
  "Playable piano key. Click it or use the mapped computer keyboard.":
    "Phím đàn chơi được. Bấm vào, hoặc dùng phím máy tính tương ứng.",
  "Height adjustment knob": "Núm chỉnh độ cao",
  "Concert benches rise on a scissor lift turned by these knobs. Click one to raise or lower the seat.":
    "Ghế đàn hòa nhạc nâng hạ bằng giá cắt kéo, xoay bằng các núm này. Bấm vào một núm để nâng hoặc hạ ghế.",
};

/** One word, two meanings: by the id of the nearest element that has one. */
const SCOPED = {
  partMeta: { Score: "Bản nhạc", Action: "Bộ máy" },
  tabPlay: { Play: "Chơi đàn" },
  helpPanel: { Play: "Chơi đàn" },
};

const LEVEL = { Low: "Thấp", Medium: "Vừa", High: "Cao", Ultra: "Tối đa" };
const PATTERNS = [
  [/^Tempo (\d+%)$/, "Tốc độ $1"],
  [/^Opened (.+): (\d+) notes$/, "Đã mở $1: $2 nốt"],
  [/^Can't read (.+?): (.+)$/, "Không đọc được $1: $2"],
  [/^(.+) — Your MIDI file$/, "$1 — Tệp MIDI của bạn"],
  [/^Recording (\d+:\d\d)$/, "Đang thu $1"],
  [/^Stop recording, (\d+:\d\d)$/, "Dừng thu, $1"],
  [/^Play (.+)$/, "Phát $1"],
  [
    /^Graphics lowered to (\w+)$/,
    (_, level) => `Đồ họa đã giảm xuống ${LEVEL[level]}`,
  ],
  [
    /^Your keys: (.*) — or tap the keys that light up\.$/,
    "Phím của bạn: $1 — hoặc chạm vào các phím sáng lên.",
  ],
  [/^(\d+) notes$/, "$1 nốt"],
  [/^(\d+) of (\d+) found$/, "Đã tìm $1/$2"],
  [/^(\d) of 3 stars$/, "$1 trên 3 sao"],
  [/^Zoom to (.+)$/, (_, part) => `Phóng tới ${VI[part] ?? part}`],
  [/^([A-G]#?-?\d) key$/, "Phím $1"],
  [
    /^(.+) is shown for anatomical reference\. Only the sustain pedal affects the sound\.$/,
    (_, pedal) =>
      `${VI[pedal] ?? pedal} chỉ để minh họa cấu tạo. Chỉ pedal ngân mới đổi âm thanh.`,
  ],
];

const ATTRIBUTES = ["aria-label", "title"];
let lang = "en";
const texts = new WeakMap(); // text node -> [english, vietnamese]
const attributes = new WeakMap(); // element -> { name: [english, vietnamese] }

function vietnamese(text, element) {
  const key = text.trim().replace(/\s+/g, " ");
  if (!key) return null;
  const scope = SCOPED[element?.closest("[id]")?.id];
  if (scope && key in scope) return scope[key];
  if (Object.hasOwn(VI, key)) return VI[key];
  for (const [pattern, to] of PATTERNS)
    if (pattern.test(key)) return key.replace(pattern, to);
  return null;
}
const untranslatable = (element) =>
  !element || element.closest("[translate=no]");

function translateText(node) {
  const element = node.parentElement;
  if (untranslatable(element) || element.closest("script, style")) return;
  const to = vietnamese(node.data, element);
  if (to === null) return;
  // Keep the spaces either side, which separate it from a <kbd> or <b>.
  const [, before, , after] = node.data.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const data = before + to + after;
  if (data === node.data) return;
  texts.set(node, [node.data, data]);
  node.data = data;
}
function translateAttribute(element, name) {
  const value = element.getAttribute(name);
  if (value === null || untranslatable(element)) return;
  const to = vietnamese(value, element);
  if (to === null || to === value) return;
  const kept = attributes.get(element) ?? {};
  kept[name] = [value, to];
  attributes.set(element, kept);
  element.setAttribute(name, to);
}
function translateTree(root) {
  if (root.nodeType === Node.TEXT_NODE) return translateText(root);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  for (const element of [root, ...root.querySelectorAll("*")])
    for (const name of ATTRIBUTES) translateAttribute(element, name);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) translateText(walker.currentNode);
}
function restoreTree(root) {
  for (const element of [root, ...root.querySelectorAll("*")])
    for (const [name, [en, vi]] of Object.entries(
      attributes.get(element) ?? {},
    ))
      if (element.getAttribute(name) === vi) element.setAttribute(name, en);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const [en, vi] = texts.get(node) ?? [];
    if (node.data === vi) node.data = en;
  }
}

new MutationObserver((records) => {
  if (lang !== "vi") return;
  for (const record of records)
    if (record.type === "attributes")
      translateAttribute(record.target, record.attributeName);
    else if (record.type === "characterData") translateText(record.target);
    else record.addedNodes.forEach(translateTree);
}).observe(document.documentElement, {
  subtree: true,
  childList: true,
  characterData: true,
  attributes: true,
  attributeFilter: ATTRIBUTES,
});

export const language = () => lang;
export function setLanguage(next) {
  lang = next === "vi" ? "vi" : "en";
  document.documentElement.lang = lang;
  if (lang === "vi") translateTree(document.documentElement);
  else restoreTree(document.documentElement);
  try {
    localStorage.setItem("vgp.lang", lang);
  } catch {
    // Storage blocked: the choice lasts for this visit.
  }
}
/** The visitor's last choice, or the browser's language. */
export function savedLanguage() {
  try {
    const saved = localStorage.getItem("vgp.lang");
    if (saved === "vi" || saved === "en") return saved;
  } catch {
    // Storage blocked: go by the browser.
  }
  return navigator.languages?.some((l) => l.startsWith("vi")) ? "vi" : "en";
}
