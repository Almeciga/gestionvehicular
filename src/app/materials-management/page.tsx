import React from 'react';
import AppLayout from '@/components/AppLayout';
import MaterialsView from './components/MaterialsView';

export default function MaterialsManagementPage() {
  return (
    <AppLayout title="Gestión de Materiales">
      <MaterialsView />
    </AppLayout>
  );
}