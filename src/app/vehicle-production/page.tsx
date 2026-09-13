import React from 'react';
import AppLayout from '@/components/AppLayout';
import VehicleProductionView from './components/VehicleProductionView';

export default function VehicleProductionPage() {
  return (
    <AppLayout title="Producción Vehicular">
      <VehicleProductionView />
    </AppLayout>
  );
}