import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import MainLayout from './layouts/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import CandidateDashboard from './pages/candidate/CandidateDashboard';
import CandidateExam from './pages/candidate/CandidateExam';
import ProctorDashboard from './pages/proctor/ProctorDashboard';
import ProctorSession from './pages/proctor/ProctorSession';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminExams from './pages/admin/AdminExams';
import AdminFingerprints from './pages/admin/AdminFingerprints';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<MainLayout />}>
            {/* Public Routes */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />

            {/* Protected Candidate Routes */}
            <Route element={<ProtectedRoute allowedRoles={['candidate']} />}>
              <Route path="/candidate/dashboard" element={<CandidateDashboard />} />
              <Route path="/candidate/exam/:examId" element={<CandidateExam />} />
            </Route>

            {/* Protected Proctor Routes */}
            <Route element={<ProtectedRoute allowedRoles={['proctor']} />}>
              <Route path="/proctor/dashboard" element={<ProctorDashboard />} />
              <Route path="/proctor/session/:sessionId" element={<ProctorSession />} />
            </Route>

            {/* Protected Admin Routes */}
            <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/exams" element={<AdminExams />} />
              <Route path="/admin/fingerprints" element={<AdminFingerprints />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
