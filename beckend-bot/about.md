# ravon_ai bot 🚀

Ushbu loyiha foydalanuvchilarning ingliz tili talaffuzini sun'iy intellekt yordamida tahlil qilish va yaxshilash uchun mo'ljallangan Telegram bot hisoblanadi.

## 🛠 Ishlash prinsipi

1.  **Audio qabul qilish:** Bot foydalanuvchidan audio xabar (voice yoki audio file) qabul qiladi.
2.  **AI Tahlil:** Qabul qilingan audio Gemini AI (Google) ga yuboriladi. AI audioni matnga o'giradi (transkripsiya) va uni kutilgan matn bilan solishtiradi.
3.  **Metrikalar:** Tahlil natijasida quyidagi ko'rsatkichlar hisoblanadi:
    *   **Accuracy (Aniqlik):** Tovushlarning to'g'ri aytilishi.
    *   **Fluency (Ravonlik):** Nutqning to'xtovsiz va silliq chiqishi.
    *   **Prosody (Ohang):** Urg'u va ritmning to'g'riligi.
4.  **Hisobot:** Foydalanuvchiga matnli xabar va batafsil PDF hisobot (faqat uzun matnlar uchun) ko'rinishida javob qaytariladi.

## 🔗 Ishlatilgan API va Texnologiyalar

*   **Node.js & Telegraf:** Botning asosi va Telegram API bilan ishlash uchun.
*   **Google Gemini AI API:** Audioni tahlil qilish, transkripsiya va talaffuz xatolarini aniqlash uchun.
*   **Edge TTS (Microsoft):** Matnni audioga o'girish (Text-to-Speech) va to'g'ri talaffuz namunalarini yaratish uchun.
*   **Supabase:** Bulutli ma'lumotlar bazasi (PostgreSQL). Foydalanuvchilar ma'lumotlari, limitlar, referal tizimi va natijalarni xavfsiz saqlash uchun ishlatiladi.
*   **PDFKit:** Professional tahlil hisobotlarini PDF formatida yaratish uchun.

## 🖥 Server va Layoqat

*   **Server turi:** Loyiha Node.js muhitida ishlaydi va har qanday VPS yoki Cloud (masalan Render, Railway) serverlarida barqaror ishlashga layoqatli.
*   **Asinxronlik:** Bot barcha so'rovlarni asinxron tartibda (async/await) bajaradi.
*   **Xavfsizlik:** `.env` fayli orqali API kalitlar himoyalangan va ma'lumotlar bazasi xavfsizligi Supabase RLS (Row Level Security) orqali ta'minlangan.

## 💾 Xotira hajmi va Resurslar

*   **Ma'lumotlar bazasi:** Supabase (PostgreSQL) ishlatilgani sababli, ma'lumotlar server o'chib yonganda ham o'chib ketmaydi va xavfsiz saqlanadi.
*   **Vaqtinchalik fayllar:** PDF va audio fayllar yaratilgandan so'ng darhol o'chiriladi (`cleanup` funksiyasi).
*   **Operativ xotira (RAM):** Bot o'rtacha **150MB - 300MB RAM** sarflaydi. Tahlil jarayonida (Gemini API bilan ishlashda) bu ko'rsatkich biroz oshishi mumkin.

---
_Loyiha talaffuzni professional darajada tahlil qilish va o'quvchilarga interaktiv ta'lim berish uchun optimallashtirilgan._