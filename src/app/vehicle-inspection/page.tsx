import React from 'react';
import AppLayout from '@/components/AppLayout';
import InspectionListView from './components/InspectionListView';

export default function VehicleInspectionPage() {
  return (
    <AppLayout title="Inspecciones">
      <InspectionListView />
    </AppLayout>
  );
}