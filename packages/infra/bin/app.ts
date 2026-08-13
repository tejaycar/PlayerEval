#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as crypto from 'crypto';
import { PlayerEvalStack } from '../lib/player-eval-stack';

const app = new cdk.App();

const branchName = process.env.BRANCH_NAME || 'main';

// Truncate branch names to avoid exceeding AWS resource name limits (e.g. S3 63-char max).
// Use first 20 chars + 8-char hash to stay unique while keeping names short.
function shortenBranch(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9]/g, '-');
  if (sanitized.length <= 28) return sanitized;
  const hash = crypto.createHash('sha256').update(name).digest('hex').slice(0, 8);
  return `${sanitized.slice(0, 20)}-${hash}`;
}

const branchPrefix = branchName === 'main' ? '' : shortenBranch(branchName);
const stackName = branchName === 'main' ? 'PlayerEval' : `PlayerEval-${branchPrefix}`;

new PlayerEvalStack(app, stackName, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-2',
  },
  branchName,
});
