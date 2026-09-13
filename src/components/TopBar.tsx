'use client';
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppImage from '@/components/ui/AppImage';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface TopBarProps {
  title?: string;
  showBack?: boolean;
  backHref?: string;
}

export default function TopBar({ title, showBack, backHref }: TopBarProps) {
  const { user, profile, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace('/login');
      router.refresh();
    } catch {
      toast.error('Error al cerrar sesión');
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-[#1B4F72] text-white shadow-md h-16 flex items-center px-4">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {showBack && backHref ? (
          <Link href={backHref} className="p-2 rounded-xl hover:bg-white/10 transition-colors flex-shrink-0">
            <Icon name="ArrowLeftIcon" size={22} className="text-white" />
          </Link>
        ) : (
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
              <AppImage
                src="/assets/images/image-1778535755369.png"
                alt="Ballistic Technology"
                width={28}
                height={28}
                className="object-contain"
                priority
              />
            </div>
            <div className="hidden sm:block">
              <div className="font-extrabold text-sm leading-tight tracking-tight">Ballistic Technology</div>
              <div className="text-[10px] text-blue-200 font-medium leading-tight">Inspección Vehicular</div>
            </div>
          </div>
        )}
        {title && (
          <h1 className="text-base font-semibold truncate ml-1">{title}</h1>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Role badge */}
        {profile && (
          <div className={`hidden sm:flex items-center gap-1.5 rounded-lg px-2 py-1 ${profile.role === 'admin' ? 'bg-purple-500/30' : 'bg-white/10'}`}>
            <Icon name={profile.role === 'admin' ? 'ShieldCheckIcon' : 'UserIcon'} size={14} className="text-white" />
            <span className="text-xs font-semibold capitalize">{profile.role === 'admin' ? 'Admin' : 'Inspector'}</span>
          </div>
        )}
        {profile?.full_name && (
          <span className="hidden md:block text-xs text-blue-200 font-medium max-w-[120px] truncate">{profile.full_name}</span>
        )}
        {user ? (
          <button
            onClick={handleSignOut}
            title="Cerrar sesión"
            className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
          >
            <Icon name="ArrowRightOnRectangleIcon" size={18} className="text-white" />
          </button>
        ) : (
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <Icon name="UserIcon" size={18} className="text-white" />
          </div>
        )}
      </div>
    </header>
  );
}