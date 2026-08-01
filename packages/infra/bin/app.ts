#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PlayerEvalStack } from '../lib/player-eval-stack';

const app = new cdk.App();

const branchName = process.env.BRANCH_NAME || 'main';
const stackName = branchName === 'main' ? 'PlayerEval' : `PlayerEval-${branchName.replace(/[^a-zA-Z0-9]/g, '-')}`;

new PlayerEvalStack(app, stackName, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-2',
  },
  branchName,
});
