# CTF Pwn Patterns

ไฟล์นี้สรุป pattern จาก write-up และตัวอย่างโค้ดจริงที่โหลดเข้ามาในโปรเจกต์

## หัวข้อที่เจอใน write-up

- other: 53 ไฟล์
- command_injection: 35 ไฟล์
- format_string: 22 ไฟล์
- buffer_overflow: 21 ไฟล์
- rop: 5 ไฟล์
- heap: 1 ไฟล์

## หัวข้อที่เดาได้จาก Devign code samples

- other: 19193 ฟังก์ชัน
- format_string: 5888 ฟังก์ชัน
- rop: 1288 ฟังก์ชัน
- command_injection: 486 ฟังก์ชัน
- buffer_overflow: 369 ฟังก์ชัน
- heap: 76 ฟังก์ชัน
- integer_overflow: 18 ฟังก์ชัน

## เอาไปใช้ยังไง

- ถ้า path ไปชน `strcpy` หรือ `strcat` ให้โยงกับ buffer overflow ก่อน
- ถ้า path ไปชน `printf` แบบไม่มี format คงที่ ให้โยง format string
- ถ้า path ไปชน `system` หรือ `exec*` ให้โยง command injection หรือ command execution
- ถ้า write-up พูดถึง `ROP`, `GOT overwrite`, `stack pivot` บ่อย แปลว่าฝั่ง retrieval สามารถเอาไปช่วยอธิบายโจทย์ pwn ต่อได้