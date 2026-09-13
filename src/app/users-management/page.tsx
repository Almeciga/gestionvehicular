import AppLayout from '@/components/AppLayout';
import UsersManagementView from './components/UsersManagementView';

export default function UsersManagementPage() {
  return (
    <AppLayout title="Gestión de Usuarios">
      <UsersManagementView />
    </AppLayout>
  );
}
