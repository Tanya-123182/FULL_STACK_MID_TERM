export const sampleExam = {
  id: 'demo-exam',
  title: 'Full Stack Web Development Certification Exam',
  code: 'FSWD-2026',
  durationMinutes: 45,
  totalQuestions: 4,
  instructions: [
    'Ensure your webcam and microphone remain active and unblocked.',
    'Do not switch tabs, minimize the browser, or open unauthorized applications.',
    'All candidate actions are logged and analyzed by ProctorShield.'
  ],
  questions: [
    {
      id: 1,
      question: 'Which HTTP status code corresponds to an "Internal Server Error"?',
      options: ['200 OK', '404 Not Found', '500 Internal Server Error', '502 Bad Gateway'],
      correctIndex: 2
    },
    {
      id: 2,
      question: 'Which data structure operates on a Last-In, First-Out (LIFO) principle?',
      options: ['Queue', 'Stack', 'Binary Search Tree', 'Linked List'],
      correctIndex: 1
    },
    {
      id: 3,
      question: 'In React, which built-in hook is specifically designed to perform side effects in functional components?',
      options: ['useState', 'useEffect', 'useContext', 'useMemo'],
      correctIndex: 1
    },
    {
      id: 4,
      question: 'In an Express.js middleware pipeline, what is the primary role of invoking next()?',
      options: [
        'Terminate the HTTP request immediately',
        'Pass execution control to the next middleware or route handler',
        'Reset the Express routing table',
        'Automatically serialize response data to JSON'
      ],
      correctIndex: 1
    }
  ]
};

export const mockCandidates = [
  {
    sessionId: 'demo-session',
    candidateName: 'John Doe',
    studentId: 'CS-2026-089',
    email: 'john.doe@university.edu',
    examTitle: 'Full Stack Web Development Exam',
    status: 'In Progress',
    flags: 2,
    severity: 'Medium',
    webcamStatus: 'Active',
    screenStatus: 'Active',
    ipAddress: '192.168.1.45',
    lastActive: '2s ago',
    progress: '3/4 Questions'
  },
  {
    sessionId: 'session-102',
    candidateName: 'Sarah Jenkins',
    studentId: 'CS-2026-114',
    email: 's.jenkins@university.edu',
    examTitle: 'Full Stack Web Development Exam',
    status: 'In Progress',
    flags: 0,
    severity: 'Low',
    webcamStatus: 'Active',
    screenStatus: 'Active',
    ipAddress: '192.168.1.72',
    lastActive: 'Just now',
    progress: '4/4 Questions'
  },
  {
    sessionId: 'session-103',
    candidateName: 'Alex Rivera',
    studentId: 'CS-2026-042',
    email: 'a.rivera@university.edu',
    examTitle: 'Full Stack Web Development Exam',
    status: 'Flagged',
    flags: 5,
    severity: 'High',
    webcamStatus: 'Lost Signal',
    screenStatus: 'Active',
    ipAddress: '10.0.4.19',
    lastActive: '6s ago',
    progress: '1/4 Questions'
  },
  {
    sessionId: 'session-104',
    candidateName: 'Priya Sharma',
    studentId: 'CS-2026-203',
    email: 'p.sharma@university.edu',
    examTitle: 'Full Stack Web Development Exam',
    status: 'In Progress',
    flags: 1,
    severity: 'Low',
    webcamStatus: 'Active',
    screenStatus: 'Active',
    ipAddress: '172.16.0.12',
    lastActive: '14s ago',
    progress: '2/4 Questions'
  }
];

export const mockRecentFlags = [
  {
    id: 'f-1',
    sessionId: 'session-103',
    candidateName: 'Alex Rivera',
    timestamp: '11:45:12 AM',
    type: 'Multiple Faces Detected',
    severity: 'High',
    detail: 'Second face recognized in camera field of view for 8 seconds.'
  },
  {
    id: 'f-2',
    sessionId: 'demo-session',
    candidateName: 'John Doe',
    timestamp: '11:43:50 AM',
    type: 'Window Focus Lost (Alt+Tab)',
    severity: 'Medium',
    detail: 'Candidate navigated away from the exam browser window.'
  },
  {
    id: 'f-3',
    sessionId: 'demo-session',
    candidateName: 'John Doe',
    timestamp: '11:40:15 AM',
    type: 'Secondary Display Plugged In',
    severity: 'Medium',
    detail: 'Hardware monitor change event detected.'
  },
  {
    id: 'f-4',
    sessionId: 'session-104',
    candidateName: 'Priya Sharma',
    timestamp: '11:38:02 AM',
    type: 'Audio Level Anomaly',
    severity: 'Low',
    detail: 'Sustained conversational audio detected in background.'
  }
];

export const mockAdminExams = [
  {
    id: 'EX-901',
    title: 'Full Stack Web Development Certification',
    code: 'FSWD-2026',
    subject: 'Computer Science',
    duration: '90 mins',
    date: '2026-10-05 10:00 AM',
    enrolled: 45,
    status: 'Scheduled'
  },
  {
    id: 'EX-902',
    title: 'Advanced Algorithms & Data Structures',
    code: 'ALGO-401',
    subject: 'Software Engineering',
    duration: '120 mins',
    date: '2026-10-06 02:00 PM',
    enrolled: 68,
    status: 'Scheduled'
  },
  {
    id: 'EX-903',
    title: 'Cybersecurity Fundamentals',
    code: 'SEC-101',
    subject: 'Information Security',
    duration: '60 mins',
    date: '2026-10-07 11:00 AM',
    enrolled: 32,
    status: 'Draft'
  },
  {
    id: 'EX-904',
    title: 'Cloud Architecture & DevOps Practice',
    code: 'CLOUD-305',
    subject: 'Cloud Systems',
    duration: '90 mins',
    date: '2026-10-08 09:30 AM',
    enrolled: 54,
    status: 'Scheduled'
  }
];

export const mockAdminFingerprints = [
  {
    id: 'FP-01',
    tool: 'ChatGPT / OpenAI',
    name: 'chatgpt.com / OpenAI Web APIs',
    category: 'GenAI Tool',
    weight: 'High (85)',
    status: 'Active'
  },
  {
    id: 'FP-02',
    tool: 'Claude / Anthropic',
    name: 'claude.ai Web Worker signature',
    category: 'GenAI Tool',
    weight: 'High (85)',
    status: 'Active'
  },
  {
    id: 'FP-03',
    tool: 'Chrome DevTools',
    name: 'inspect_window & debugger attach hooks',
    category: 'Debugger',
    weight: 'Critical (100)',
    status: 'Active'
  },
  {
    id: 'FP-04',
    tool: 'Discord / Slack',
    name: 'discord.exe / electron screen capture hook',
    category: 'Communication',
    weight: 'Medium (50)',
    status: 'Active'
  },
  {
    id: 'FP-05',
    tool: 'TeamViewer / AnyDesk',
    name: 'remote_desktop_service & mirror driver',
    category: 'Remote Access',
    weight: 'Critical (100)',
    status: 'Active'
  },
  {
    id: 'FP-06',
    tool: 'GitHub Copilot / IDEs',
    name: 'copilot-agent background daemon process',
    category: 'IDE Extension',
    weight: 'High (75)',
    status: 'Inactive'
  }
];
