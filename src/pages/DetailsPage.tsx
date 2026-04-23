import { motion } from 'motion/react';
import Header from '../components/Header';
import { ArrowLeft, Shield, Zap, Lock, Globe } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

export default function DetailsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-900 text-white font-sans">
      <Header />
      
      <main className="max-w-4xl mx-auto px-4 py-20">
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          돌아가기
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
            왜 <span className="text-red-500">Localvert</span>인가요?
          </h1>
          <p className="text-xl text-neutral-400 mb-16 leading-relaxed">
            Localvert는 단순히 파일을 변환하는 도구 그 이상입니다. 사용자의 데이터를 존중하고, 
            100% 무료로 제한 없이 서비스를 제공해드립니다..
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20">
          <FeatureCard 
            icon={<Shield className="w-6 h-6 text-red-500" />}
            title="100% 로컬"
            description="모든 변환 과정은 당신의 브라우저 안에서만 일어납니다. 파일이 서버로 업로드되지 않아 절대적으로 안전합니다."
          />
          <FeatureCard 
            icon={<Zap className="w-6 h-6 text-red-500" />}
            title="WASM 가속"
            description="WebAssembly 기술을 사용하여 서버를 거치지 않고도 하드웨어의 성능을 최대한 끌어내어 빠른 속도를 보장합니다."
          />
          <FeatureCard 
            icon={<Lock className="w-6 h-6 text-red-500" />}
            title="데이터 프라이버시"
            description="어떤 로그도, 어떤 캐시도 서버에 저장되지 않습니다. 변환 후 브라우저를 닫으면 모든 흔적이 사라집니다."
          />
          <FeatureCard 
            icon={<Globe className="w-6 h-6 text-red-500" />}
            title="안정성"
            description="신뢰도 있는 FFmpeg 엔진을 기반으로 구동되어 높은 안정성을 자랑합니다."
          />
        </div>
      </main>
      
      <footer className="border-t border-neutral-800 py-12 text-center text-neutral-500 text-sm">
        &copy; 2026 Localvert. All rights reserved. 100% Client-side.
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: ReactNode, title: string, description: string }) {
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="p-8 rounded-2xl bg-neutral-800/30 border border-neutral-800 hover:border-neutral-700 transition-colors"
    >
      <div className="mb-4">{icon}</div>
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-neutral-400 leading-relaxed">{description}</p>
    </motion.div>
  );
}
