import { createBrowserRouter, Navigate } from 'react-router';
import { ProfileSettingsPage } from '@/features/profile/ProfileSettingsPage';
import { NutritionPage, NutritionProgressPage } from '@/features/nutrition/NutritionPages';
import { NutritionProgramPage } from '@/features/nutrition/NutritionProgramPage';
import { AuthCallbackPage, ForgotPasswordPage, SignInPage } from '@/features/auth/AuthPages';
import { ClientActivityPage, ReviewsPage } from '@/features/activity/ActivityViews';
import { ClientDetailPage } from '@/features/clients/ClientDetailPage';
import { ClientsPage } from '@/features/clients/ClientsPage';
import { ProgramEditorPage } from '@/features/programs/ProgramEditorPage';
import { ClientHomePage, CoachPlaceholderPage } from '@/features/home/ClientPages';
import { CoachTrainingLogPage, TrainingPage, TrainingProgramPage } from '@/features/training/TrainingPages';
import { UseNoticePage } from '@/components/LegalFooter';
import { USE_NOTICE_PATH } from '@/lib/legal';
import { HomeRedirect, RequireClient, RequireSignedIn, RequireStaff } from './guards';
import { ClientLayout, CoachLayout } from './layouts';

export const router = createBrowserRouter([
  { path: '/sign-in', element: <SignInPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  { path: USE_NOTICE_PATH, element: <UseNoticePage /> },
  {
    element: <RequireSignedIn />,
    children: [
      { index: true, element: <HomeRedirect /> },
      {
        element: <RequireClient />,
        children: [
          {
            element: <ClientLayout />,
            children: [
              { path: '/home', element: <ClientHomePage /> },
              { path: '/profile', element: <ProfileSettingsPage /> },
              {
                element: <RequireClient section="training" />,
                children: [
                  { path: '/training', element: <TrainingPage /> },
                  { path: '/training/:programId', element: <TrainingProgramPage /> },
                ],
              },
              {
                element: <RequireClient section="nutrition" />,
                children: [{ path: '/nutrition', element: <NutritionPage /> }, { path: '/nutrition/:programId', element: <NutritionProgramPage /> }],
              },
              {
                element: <RequireClient section="progress" />,
                children: [{ path: '/progress', element: <NutritionProgressPage /> }],
              },
            ],
          },
        ],
      },
      {
        element: <RequireStaff />,
        children: [
          {
            element: <CoachLayout />,
            children: [
              { path: '/coach', element: <Navigate to="/coach/clients" replace /> },
              { path: '/coach/clients', element: <ClientsPage /> },
              { path: '/coach/profile', element: <ProfileSettingsPage /> },
              { path: '/coach/clients/:clientId', element: <ClientDetailPage /> },
              { path: '/coach/clients/:clientId/activity', element: <ClientActivityPage /> },
              { path: '/coach/clients/:clientId/nutrition', element: <NutritionPage coach /> },
              { path: '/coach/clients/:clientId/nutrition/:programId', element: <NutritionProgramPage coach /> },
              { path: '/coach/clients/:clientId/nutrition/:programId/log', element: <NutritionProgramPage coach published /> },
              { path: '/coach/clients/:clientId/programs/:programId', element: <ProgramEditorPage /> },
              { path: '/coach/clients/:clientId/programs/:programId/log', element: <CoachTrainingLogPage /> },
              { path: '/coach/templates', element: <CoachPlaceholderPage title="Templates" body="Reusable program templates arrive with the program model in M3." /> },
              { path: '/coach/reviews', element: <ReviewsPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
