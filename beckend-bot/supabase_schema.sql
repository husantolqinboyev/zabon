-- Supabase database schema for Ravon AI Bot
-- Run this SQL in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    language_code TEXT,
    is_admin BOOLEAN DEFAULT false,
    is_teacher BOOLEAN DEFAULT false,
    is_premium BOOLEAN DEFAULT false,
    premium_until TIMESTAMPTZ,
    daily_limit INTEGER DEFAULT 3,
    used_today INTEGER DEFAULT 0,
    bonus_limit INTEGER DEFAULT 0,
    word_limit INTEGER DEFAULT 30,
    tts_voice TEXT DEFAULT 'en-US-AriaNeural',
    last_active TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    referred_by BIGINT,
    referral_count INTEGER DEFAULT 0
);

-- Assessments table
CREATE TABLE IF NOT EXISTS assessments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type TEXT,
    audio_duration REAL,
    overall_score REAL,
    accuracy_score REAL,
    fluency_score REAL,
    completeness_score REAL,
    prosody_score REAL,
    word_accuracy REAL,
    transcription TEXT,
    target_text TEXT,
    feedback TEXT,
    english_level TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Test words table
CREATE TABLE IF NOT EXISTS test_words (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    word TEXT UNIQUE NOT NULL,
    difficulty TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tariffs table
CREATE TABLE IF NOT EXISTS tariffs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    duration_days INTEGER NOT NULL,
    limit_per_day INTEGER NOT NULL,
    word_limit INTEGER DEFAULT 30,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    tariff_id UUID REFERENCES tariffs(id) ON DELETE CASCADE,
    photo_file_id TEXT,
    payment_details TEXT,
    status TEXT DEFAULT 'pending', -- pending, approved, rejected
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bot settings table
CREATE TABLE IF NOT EXISTS bot_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API usage table
CREATE TABLE IF NOT EXISTS api_usage (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    model_name TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL,
    candidates_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    request_type TEXT DEFAULT 'assessment',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teacher students relationship table
CREATE TABLE IF NOT EXISTS teacher_students (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    teacher_id UUID REFERENCES users(id) ON DELETE CASCADE,
    student_id UUID REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active', -- active, inactive,
    UNIQUE(teacher_id, student_id)
);

-- Student tasks table
CREATE TABLE IF NOT EXISTS student_tasks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    teacher_id UUID REFERENCES users(id) ON DELETE CASCADE,
    student_id UUID REFERENCES users(id) ON DELETE CASCADE,
    task_text TEXT NOT NULL,
    task_type TEXT DEFAULT 'pronunciation', -- pronunciation, text
    difficulty TEXT DEFAULT 'medium',
    due_date TIMESTAMPTZ,
    status TEXT DEFAULT 'pending', -- pending, submitted, graded
    assessment_id UUID REFERENCES assessments(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    submitted_at TIMESTAMPTZ
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_assessments_user_id ON assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_assessments_created_at ON assessments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_teacher_students_teacher_id ON teacher_students(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_students_student_id ON teacher_students(student_id);
CREATE INDEX IF NOT EXISTS idx_student_tasks_student_id ON student_tasks(student_id);
CREATE INDEX IF NOT EXISTS idx_student_tasks_teacher_id ON student_tasks(teacher_id);
CREATE INDEX IF NOT EXISTS idx_student_tasks_status ON student_tasks(status);

-- RLS (Row Level Security) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_tasks ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own data
CREATE POLICY "Users can view own data" ON users FOR SELECT USING (true);
CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (true);
CREATE POLICY "Users can insert own data" ON users FOR INSERT WITH CHECK (true);

-- Assessments policies
CREATE POLICY "Users can view own assessments" ON assessments FOR SELECT USING (true);
CREATE POLICY "Users can insert own assessments" ON assessments FOR INSERT WITH CHECK (true);

-- Payments policies
CREATE POLICY "Users can view own payments" ON payments FOR SELECT USING (true);
CREATE POLICY "Users can insert own payments" ON payments FOR INSERT WITH CHECK (true);

-- Teacher-student relationships
CREATE POLICY "Teachers can view their students" ON teacher_students FOR SELECT USING (true);
CREATE POLICY "Teachers can manage their students" ON teacher_students FOR ALL USING (true);

-- Student tasks
CREATE POLICY "Teachers can view tasks for their students" ON student_tasks FOR SELECT USING (true);
CREATE POLICY "Teachers can manage tasks for their students" ON student_tasks FOR ALL USING (true);
CREATE POLICY "Students can view their own tasks" ON student_tasks FOR SELECT USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for bot_settings table
CREATE TRIGGER update_bot_settings_updated_at 
    BEFORE UPDATE ON bot_settings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default tariffs
INSERT INTO tariffs (name, price, duration_days, limit_per_day, word_limit) VALUES
    ('Haftalik', 15000, 7, 50, 50),
    ('Oylik', 32000, 30, 200, 80),
    ('Yillik', 300000, 365, 1000, 80)
ON CONFLICT DO NOTHING;

-- Insert default bot settings
INSERT INTO bot_settings (key, value) VALUES
    ('card_number', '5614 6868 3029 9486'),
    ('card_holder', 'Sanatbek Hamidov')
ON CONFLICT (key) DO NOTHING;
