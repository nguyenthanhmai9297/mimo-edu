import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from '../features/auth/LandingPage';
import { StudentPortalPage } from '../features/student-portal/StudentPortalPage';
import { RequireAdminGuard } from './guards/RequireAdminGuard';
import { AdminLayout } from '../components/layout/AdminLayout';
import { AdminDashboard } from '../features/dashboard/AdminDashboard';
import { ClassesPage } from '../features/classes/ClassesPage';
import { StudentsPage } from '../features/students/StudentsPage';
import { HomeworkPage } from '../features/homework/HomeworkPage';
import { AssignmentsPage } from '../features/assignments/AssignmentsPage';
import { GradingPage } from '../features/grading/GradingPage';
import { CommentsPage } from '../features/comments/CommentsPage';
import { GamesAdminPage } from '../features/games/GamesAdminPage';
import { AdminAllowlistPage } from '../features/auth/AdminAllowlistPage';

export const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Landing Page */}
        <Route path="/" element={<LandingPage />} />

        {/* Mobile-First Parent & Student Portal */}
        <Route path="/portal" element={<StudentPortalPage />} />

        {/* Protected Admin / Teacher Portal */}
        <Route element={<RequireAdminGuard />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="classes" element={<ClassesPage />} />
            <Route path="classes/:classId" element={<ClassesPage />} />
            <Route path="students" element={<StudentsPage />} />
            <Route path="homework" element={<HomeworkPage />} />
            <Route path="assignments" element={<AssignmentsPage />} />
            <Route path="grading" element={<GradingPage />} />
            <Route path="comments" element={<CommentsPage />} />
            <Route path="games" element={<GamesAdminPage />} />
            <Route path="settings" element={<AdminAllowlistPage />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
