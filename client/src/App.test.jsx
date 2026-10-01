import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

describe('ProctorShield Authentication & Protected Route Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('1. Renders Login page with institutional form and removes role dropdown', () => {
    render(<App />);
    expect(screen.getByText('ProctorShield Login')).toBeTruthy();
    expect(screen.getByLabelText(/Email Address/i)).toBeTruthy();
    expect(screen.getByLabelText(/Password/i)).toBeTruthy();
    expect(screen.queryByLabelText(/Select Access Role/i)).toBeNull();
  });

  it('2. Shows error message on failed login with invalid credentials', async () => {
    // Mock failed fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid email or password' })
    });

    render(<App />);

    const emailInput = screen.getByLabelText(/Email Address/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitBtn = screen.getByRole('button', { name: /Sign In to Portal/i });

    fireEvent.change(emailInput, { target: { value: 'wrong@domain.com' } });
    fireEvent.change(passwordInput, { target: { value: 'badpass' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Invalid email or password/i)).toBeTruthy();
    });
  });

  it('3. Successful Candidate login navigates to Candidate Dashboard', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/exams')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            exams: [
              {
                _id: 'exam-demo-01',
                title: 'Full Stack Web Development Certification Exam',
                description: 'Proctored Comprehensive Assessment',
                durationMinutes: 45,
                questions: [1, 2, 3]
              }
            ]
          })
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          token: 'mock_candidate_token_xyz',
          user: {
            id: 'user-01',
            name: 'Alex Candidate',
            email: 'candidate@proctorshield.io',
            role: 'candidate'
          }
        })
      });
    });

    render(<App />);

    const submitBtn = screen.getByRole('button', { name: /Sign In to Portal/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Welcome back, Alex!/i)).toBeTruthy();
      expect(screen.getByText(/Full Stack Web Development Certification Exam/i)).toBeTruthy();
    });

    expect(localStorage.getItem('proctorshield_token')).toBe('mock_candidate_token_xyz');
  });

  it('4. Successful Proctor login navigates to Proctor Control Center', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/exams')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ exams: [] })
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          token: 'mock_proctor_token_abc',
          user: {
            id: 'user-02',
            name: 'Sarah Proctor',
            email: 'proctor@proctorshield.io',
            role: 'proctor'
          }
        })
      });
    });

    render(<App />);

    const proctorQuickBtn = screen.getByRole('button', { name: 'Proctor' });
    fireEvent.click(proctorQuickBtn);

    const submitBtn = screen.getByRole('button', { name: /Sign In to Portal/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Live Proctoring Center')).toBeTruthy();
      expect(screen.getByText('Active Candidates')).toBeTruthy();
    });
  });

  it('5. Successful Admin login navigates to Admin Dashboard', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        token: 'mock_admin_token_123',
        user: {
          id: 'user-03',
          name: 'Dr. Eleanor Admin',
          email: 'admin@proctorshield.io',
          role: 'admin'
        }
      })
    });

    render(<App />);

    const adminQuickBtn = screen.getByRole('button', { name: 'Admin' });
    fireEvent.click(adminQuickBtn);

    const submitBtn = screen.getByRole('button', { name: /Sign In to Portal/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Admin Operations Center')).toBeTruthy();
      expect(screen.getByText('Exam Management')).toBeTruthy();
    });
  });

  it('6. Logout action clears session and returns to login', async () => {
    // Seed authenticated session in localStorage
    localStorage.setItem('proctorshield_token', 'mock_cand_token');
    localStorage.setItem(
      'proctorshield_user',
      JSON.stringify({ id: 'user-01', name: 'Alex Candidate', email: 'candidate@proctorshield.io', role: 'candidate' })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Alex Candidate/i)).toBeTruthy();
      expect(screen.getByText('Sign Out')).toBeTruthy();
    });

    const logoutBtn = screen.getByText('Sign Out');
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(screen.getByText('ProctorShield Login')).toBeTruthy();
    });

    expect(localStorage.getItem('proctorshield_token')).toBeNull();
  });

  it('7. Candidate role is restricted when trying to access admin pages', async () => {
    localStorage.setItem('proctorshield_token', 'mock_cand_token');
    localStorage.setItem(
      'proctorshield_user',
      JSON.stringify({ id: 'user-01', name: 'Alex Candidate', email: 'candidate@proctorshield.io', role: 'candidate' })
    );

    // Initial render lands on candidate dashboard
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Welcome back, Alex!/i)).toBeTruthy();
    });

    // In navbar, admin links shouldn't even be displayed for candidate
    expect(screen.queryByText('Admin Dashboard')).toBeNull();
    expect(screen.queryByText('Anti-Cheat Rules')).toBeNull();
  });
});
