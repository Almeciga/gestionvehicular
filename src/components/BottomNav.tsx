'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';

export default function BottomNav() {
  const pathname = usePathname();
  const { isAdmin, isInspector, isComercial, loading } = useAuth();

  const allNavItems = [
    {
      href: '/vehicle-inspection',
      label: 'Inspecciones',
      icon: 'ClipboardDocumentCheckIcon' as const,
      roles: ['admin', 'inspector'],
    },
    {
      href: '/vehicle-production',
      label: 'Producción',
      icon: 'WrenchScrewdriverIcon' as const,
      roles: ['admin', 'comercial'],
    },
    {
      href: '/production-orders',
      label: 'Órdenes',
      icon: 'ClipboardDocumentListIcon' as const,
      roles: ['admin', 'comercial', 'inspector'],
    },
    {
      href: '/materials-management',
      label: 'Materiales',
      icon: 'CubeIcon' as const,
      roles: ['admin'],
    },
    {
      href: '/users-management',
      label: 'Usuarios',
      icon: 'UsersIcon' as const,
      roles: ['admin'],
    },
    {
      href: '/logs',
      label: 'Logs',
      icon: 'ExclamationTriangleIcon' as const,
      roles: ['admin'],
    },
  ];

  const currentRole = loading
    ? null
    : isAdmin
    ? 'admin'
    : isComercial
    ? 'comercial'
    : isInspector
    ? 'inspector'
    : null;

  const navItems = allNavItems.filter((item) =>
    currentRole ? item.roles.includes(currentRole) : false
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg">
      <div className="flex items-stretch h-16 max-w-screen-2xl mx-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={`nav-${item.href}`}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors relative ${
                isActive
                  ? 'text-[#1B4F72] bg-primary-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon
                name={item.icon}
                size={24}
                variant={isActive ? 'solid' : 'outline'}
                className={isActive ? 'text-[#1B4F72]' : 'text-gray-500'}
              />
              <span className={`text-xs font-semibold ${isActive ? 'text-[#1B4F72]' : 'text-gray-500'}`}>
                {item.label}
              </span>
              {isActive && (
                <div className="absolute bottom-0 w-12 h-0.5 bg-[#1B4F72] rounded-t-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}