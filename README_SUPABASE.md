# Supabase ga o'tkazish yo'riqnoma

## Tayyorgarlik

### 1. Supabase project yaratish
1. [Supabase](https://supabase.com) ga kirib yangi project yarating
2. Project URL va API kalitlarini oling:
   - Project URL
   - Anon Key
   - Service Role Key

### 2. Environment variables
`.env` fayliga quyidagilarni qo'shing:
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_KEY=your_service_key_here
```

## O'tkazish qadamlari

### 1. Database schema yaratish
1. Supabase dashboard -> SQL Editor ga o'ting
2. `supabase_schema.sql` faylidagi kodni nusxalab SQL Editorga qo'ying
3. "Run" tugmasini bosing
4. Barcha table'lar va index'lar yaratiladi

### 2. Ma'lumotlarni migratsiya qilish
1. `.env` fayliga Supabase ma'lumotlarini kiriting
2. Migratsiya script'ini ishga tushuring:
```bash
node migrate_to_supabase.js
```

### 3. Database faylini almashtirish
1. Eski `database.js` faylini backup qiling:
```bash
mv database.js database_sqlite.js
```

2. Yangi database faylini o'rnating:
```bash
mv database_supabase.js database.js
```

### 4. Test qilish
```bash
npm start
```

## Muhim farqlar

### UUID vs INTEGER
- SQLite: INTEGER PRIMARY KEY AUTOINCREMENT
- Supabase: UUID DEFAULT uuid_generate_v4()

### Timestamp format
- SQLite: DATETIME DEFAULT CURRENT_TIMESTAMP
- Supabase: TIMESTAMPTZ DEFAULT NOW()

### Row Level Security (RLS)
Supabase da RLS yoqilgan, bu ma'lumotlarni xavfsizroq qiladi.

## Troubleshooting

### Migratsiya xatoliklari
- Agar migratsiya paytida xatolik yuz bersa, loglarni tekshiring
- Qisman migratsiya bo'lsa, qayta ishga tushirish xavfsiz (duplicate data qo'shilmaydi)

### Connection xatoliklari
- SUPABASE_URL to'g'ri ekanligini tekshiring
- API kalitlari to'g'ri ekanligini tekshiring
- Internet connectionni tekshiring

### Performance
- Supabase da birinchi so'rovlar sekin bo'lishi mumkin (cold start)
- Index'lar to'g'ri yaratilganligini tekshiring

## Afzalliklari

✅ **Cloud-based** - Har qanday joydan kirish  
✅ **Real-time** - Real-time updates  
✅ **Scalability** - Yaxshiroq scaling  
✅ **Backup** - Avtomatik backup  
✅ **Security** - Row Level Security  
✅ **API** - Avtomatik API generatsiya  
✅ **Dashboard** - Boshqaruv paneli  

## Support

Agar muammo yuz bersa:
1. Supabase [documentation](https://supabase.com/docs) ni tekshiring
2. Supabase dashboard'da loglarni ko'ring
3. Discord communityda yordam so'ring
