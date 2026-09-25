'use client';
import { useState, useEffect } from 'react';
import { useUser } from '@/lib/UserContext';
import { usePathname } from 'next/navigation';

export default function AIAvatar() {
  const { profile } = useUser();
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(false);
  const [message, setMessage] = useState('');
  
  const personaEmoji = profile.tutorPersona === '熱血コーチ' ? '🔥' : profile.tutorPersona === '論理的メンター' ? '🤖' : '🌸';

  useEffect(() => {
    // ページ遷移ごとにランダムなコメントを出す疑似双方向コミュニケーション
    setIsVisible(false);
    const timer = setTimeout(() => {
      let msg = '';
      if (pathname === '/dashboard') {
        msg = `今日の気分は「${profile.currentMood || '普通'}」だね！${profile.tutorPersona === '熱血コーチ' ? '気合入れていこうぜ！' : '無理せず頑張ろうね！'}`;
      } else if (pathname === '/drill') {
        msg = 'ドリル開始だね！間違えたところはノートに保存するんだよ。';
      } else if (pathname === '/pomodoro') {
        msg = '集中モードだね！私が時間を計っておくから全集中で！';
      } else if (pathname === '/plan') {
        msg = '計画を立てるのは合格への第一歩！偉いよ！';
      } else {
        msg = '困ったことがあったらチャットでいつでも聞いてね。';
      }
      
      setMessage(msg);
      setIsVisible(true);
      
      // 5秒後に消える
      setTimeout(() => setIsVisible(false), 5000);
    }, 1500); // ページロードから1.5秒後にポップアップ

    return () => clearTimeout(timer);
  }, [pathname, profile.currentMood, profile.tutorPersona]);

  if (!isVisible) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '30px',
      right: '30px',
      display: 'flex',
      alignItems: 'flex-end',
      gap: '12px',
      zIndex: 9999,
      animation: 'slideUp 0.3s ease-out'
    }}>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      
      {/* 吹き出し */}
      <div style={{
        background: 'white',
        padding: '12px 16px',
        borderRadius: '16px',
        borderBottomRightRadius: '4px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        maxWidth: '250px',
        fontSize: '0.9rem',
        fontWeight: 'bold',
        color: '#1e293b'
      }}>
        {message}
      </div>
      
      {/* アバター */}
      <div style={{
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: '1.8rem',
        boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)',
        border: '3px solid white',
        cursor: 'pointer'
      }} onClick={() => window.location.href='/chat'}>
        {personaEmoji}
      </div>
    </div>
  );
}
