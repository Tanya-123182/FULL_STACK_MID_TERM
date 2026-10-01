/**
 * Socket.IO Room Helpers
 * Standardizes exam and session room names across ProctorShield.
 */

export const getExamRoom = (examId) => `exam:${examId}`;
export const getSessionRoom = (sessionId) => `session:${sessionId}`;
