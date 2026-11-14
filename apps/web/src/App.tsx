import { Link, Route, Routes } from 'react-router-dom';
import { PanelLayout, PublicLayout } from './components/Layout.js';
import { HomePage } from './pages/public/Home.js';
import { HowItWorksPage } from './pages/public/HowItWorks.js';
import { PricingPage } from './pages/public/Pricing.js';
import { SamplePage } from './pages/public/Sample.js';
import { CoveragePage } from './pages/public/Coverage.js';
import { FaqPage } from './pages/public/Faq.js';
import { ContactPage } from './pages/public/Contact.js';
import { ConsentPage, PrivacyPage, TermsPage } from './pages/public/Legal.js';
import { LoginPage } from './pages/auth/Login.js';
import { AuthCallbackPage } from './pages/auth/AuthCallback.js';
import { ClientDashboardPage } from './pages/app/Dashboard.js';
import { OpportunitiesPage } from './pages/app/Opportunities.js';
import { AnalysisDetailPage, OpportunityDetailPage } from './pages/app/OpportunityDetail.js';
import { AnalysisChatPage } from './pages/app/AnalysisChat.js';
import { NotificationsPage } from './pages/app/Notifications.js';
import { PreferencesPage } from './pages/app/Preferences.js';
import { ProfilePage } from './pages/app/Profile.js';
import { OnboardingPage } from './pages/app/Onboarding.js';
import { UsagePage } from './pages/app/Usage.js';
import { SupportPage } from './pages/app/Support.js';
import { AdminDashboardPage } from './pages/admin/Dashboard.js';
import { AdminFunnelPage } from './pages/admin/Funnel.js';
import { AdminFinancesPage } from './pages/admin/Finances.js';
import { AdminClientsPage } from './pages/admin/Clients.js';
import { AdminQualityPage, AdminSourcesPage } from './pages/admin/QualitySources.js';
import { AdminCommsPage, AdminSupportPage } from './pages/admin/CommsSupport.js';
import { AdminAuditPage, AdminSettingsPage } from './pages/admin/SettingsAudit.js';

const CLIENT_NAV = [
  { to: '/app', label: 'Inicio', end: true },
  { to: '/app/oportunidades', label: 'Oportunidades' },
  { to: '/app/avisos', label: 'Avisos' },
  { to: '/app/preferencias', label: 'Preferencias' },
  { to: '/app/perfil', label: 'Perfil' },
  { to: '/app/onboarding', label: 'Onboarding' },
  { to: '/app/plan', label: 'Plan y suscripción' },
  { to: '/app/soporte', label: 'Soporte' },
];

const ADMIN_NAV = [
  { to: '/admin', label: 'Resumen', end: true },
  { to: '/admin/embudo', label: 'Embudo' },
  { to: '/admin/finanzas', label: 'Finanzas' },
  { to: '/admin/clientes', label: 'Clientes' },
  { to: '/admin/calidad', label: 'Calidad' },
  { to: '/admin/fuentes', label: 'Fuentes y operaciones' },
  { to: '/admin/comunicaciones', label: 'Comunicaciones' },
  { to: '/admin/soporte', label: 'Soporte' },
  { to: '/admin/configuracion', label: 'Configuración' },
  { to: '/admin/auditoria', label: 'Auditoría' },
];

export function NotFoundPage() {
  return (
    <div>
      <h1>Página no encontrada</h1>
      <p>La página que buscas no existe o ha cambiado de dirección.</p>
      <p>
        <Link to="/">Volver al inicio</Link>
      </p>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/como-funciona" element={<HowItWorksPage />} />
        <Route path="/precios" element={<PricingPage />} />
        <Route path="/muestra" element={<SamplePage />} />
        <Route path="/cobertura" element={<CoveragePage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/contacto" element={<ContactPage />} />
        <Route path="/legal/condiciones" element={<TermsPage />} />
        <Route path="/legal/privacidad" element={<PrivacyPage />} />
        <Route path="/legal/consentimiento" element={<ConsentPage />} />
        <Route path="/acceso" element={<LoginPage />} />
        <Route path="/acceso/confirmar" element={<AuthCallbackPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="/app" element={<PanelLayout title="Panel del cliente" nav={CLIENT_NAV} />}>
        <Route index element={<ClientDashboardPage />} />
        <Route path="oportunidades" element={<OpportunitiesPage />} />
        <Route path="oportunidades/:id" element={<OpportunityDetailPage />} />
        <Route path="analisis/:id" element={<AnalysisDetailPage />} />
        <Route path="analisis/:id/chat" element={<AnalysisChatPage />} />
        <Route path="avisos" element={<NotificationsPage />} />
        <Route path="preferencias" element={<PreferencesPage />} />
        <Route path="perfil" element={<ProfilePage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="plan" element={<UsagePage />} />
        <Route path="soporte" element={<SupportPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="/admin" element={<PanelLayout title="Panel de administración" nav={ADMIN_NAV} />}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="embudo" element={<AdminFunnelPage />} />
        <Route path="finanzas" element={<AdminFinancesPage />} />
        <Route path="clientes" element={<AdminClientsPage />} />
        <Route path="calidad" element={<AdminQualityPage />} />
        <Route path="fuentes" element={<AdminSourcesPage />} />
        <Route path="comunicaciones" element={<AdminCommsPage />} />
        <Route path="soporte" element={<AdminSupportPage />} />
        <Route path="configuracion" element={<AdminSettingsPage />} />
        <Route path="auditoria" element={<AdminAuditPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
