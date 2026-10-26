import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { LandingPage } from '../features/auth/LandingPage';
import { RequireAdminGuard } from './guards/RequireAdminGuard';
import { MimoLoading } from '../components/ui/MimoLoading';
import { loadStudentPortal } from './studentChunks';

/**
 * Only the landing page ships in the first download. The student portal and
 * every teacher page are separate chunks, fetched when first opened (the
 * portal is also prefetched from the landing page, see studentChunks.ts).
 */
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, key: K) =>
  lazy(() => load().then((m) => ({ default: m[key] })));

const StudentPortalPage = named(loadStudentPortal, 'StudentPortalPage');
const StudentQuizPage = named(() => import('../features/student-portal/StudentQuizPage'), 'StudentQuizPage');
const AdminLayout = named(() => import('../components/layout/AdminLayout'), 'AdminLayout');
const AdminDashboard = named(() => import('../features/dashboard/AdminDashboard'), 'AdminDashboard');
const ClassesPage = named(() => import('../features/classes/ClassesPage'), 'ClassesPage');
const StudentsPage = named(() => import('../features/students/StudentsPage'), 'StudentsPage');
const HomeworkPage = named(() => import('../features/homework/HomeworkPage'), 'HomeworkPage');
const AssignmentsPage = named(() => import('../features/assignments/AssignmentsPage'), 'AssignmentsPage');
const GradingPage = named(() => import('../features/grading/GradingPage'), 'GradingPage');
const CommentsPage = named(() => import('../features/comments/CommentsPage'), 'CommentsPage');
const GamesAdminPage = named(() => import('../features/games/GamesAdminPage'), 'GamesAdminPage');
const Geometry3DPage = named(() => import('../features/geometry3d/Geometry3DPage'), 'Geometry3DPage');
const AdminAllowlistPage = named(() => import('../features/auth/AdminAllowlistPage'), 'AdminAllowlistPage');
const PracticeAdminPage = named(() => import('../features/practice/admin/PracticeAdminPage'), 'PracticeAdminPage');
const TeachingToolsPage = named(() => import('../features/tools/TeachingToolsPage'), 'TeachingToolsPage');
const TeachingToolRunner = named(() => import('../features/tools/TeachingToolRunner'), 'TeachingToolRunner');

const pageFallback = <MimoLoading variant="page" />;
/** Teacher pages load inside the Studio layout, which stays on screen. */
const AdminPages: React.FC = () => (
  <Suspense fallback={<MimoLoading text="Đang mở trang…" />}>
    <Outlet />
  </Suspense>
);

export const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={pageFallback}>
        <Routes>
          {/* Public Landing Page */}
          <Route path="/" element={<LandingPage />} />

          {/* Mobile-First Parent & Student Portal */}
          <Route path="/portal" element={<StudentPortalPage />} />
          {/* Mimo Quiz: students join the teacher's room with a code */}
          <Route path="/quiz" element={<StudentQuizPage />} />

          {/* Protected Admin / Teacher Portal */}
          <Route element={<RequireAdminGuard />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route element={<AdminPages />}>
                <Route index element={<AdminDashboard />} />
                <Route path="tools" element={<TeachingToolsPage />} />
                <Route path="tools/:toolId" element={<TeachingToolRunner />} />
                <Route path="classes" element={<ClassesPage />} />
                <Route path="classes/:classId" element={<ClassesPage />} />
                <Route path="students" element={<StudentsPage />} />
                <Route path="homework/*" element={<HomeworkPage />} />
                <Route path="geometry3d" element={<Geometry3DPage />} />
                <Route path="practice" element={<PracticeAdminPage />} />
                <Route path="assignments" element={<AssignmentsPage />} />
                <Route path="grading" element={<GradingPage />} />
                <Route path="comments" element={<CommentsPage />} />
                <Route path="games" element={<GamesAdminPage />} />
                <Route path="settings" element={<AdminAllowlistPage />} />
              </Route>
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};
