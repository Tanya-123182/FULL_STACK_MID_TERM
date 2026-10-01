#!/usr/bin/env node
/**
 * ProctorShield Load Test CLI Runner
 * Parses CLI arguments and executes the load simulator.
 */

import { runLoadTest } from './simulator.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {};

  for (const arg of args) {
    if (arg.startsWith('--clients=')) {
      config.numberOfClients = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--duration=')) {
      config.testDurationSeconds = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--url=')) {
      config.serverUrl = arg.split('=')[1];
    } else if (arg.startsWith('--signal-interval=')) {
      config.signalIntervalMs = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--heartbeat-interval=')) {
      config.heartbeatIntervalMs = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--suspicious-rate=')) {
      config.suspiciousSignalRate = parseFloat(arg.split('=')[1]);
    } else if (arg.startsWith('--ramp-up=')) {
      config.rampUpMs = parseInt(arg.split('=')[1], 10);
    }
  }

  return config;
}

const config = parseArgs();

runLoadTest(config)
  .then((report) => {
    if (report.successPercentage < 90) {
      console.error(`❌ Load test failed: Connection success rate was ${report.successPercentage}% (expected >= 90%)`);
      process.exit(1);
    }
    console.log('✅ Load test benchmark completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Load test encountered an unhandled error:', err);
    process.exit(1);
  });
