import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';
import * as crypto from 'crypto';
import * as path from 'path';

interface PlayerEvalStackProps extends cdk.StackProps {
  branchName: string;
}

// Truncate branch names to stay within AWS resource name limits.
// Produces max 28 chars: first 20 + dash + 8-char hash (if over 28 chars).
function shortenBranch(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9]/g, '-');
  if (sanitized.length <= 28) return sanitized;
  const hash = crypto.createHash('sha256').update(name).digest('hex').slice(0, 8);
  return `${sanitized.slice(0, 20)}-${hash}`;
}

export class PlayerEvalStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PlayerEvalStackProps) {
    super(scope, id, props);

    const { branchName } = props;
    const isProduction = branchName === 'main';
    const branchPrefix = isProduction ? '' : shortenBranch(branchName);

    // === DynamoDB Table ===
    // Single table design - shared across branches with prefix
    const tableName = isProduction ? 'PlayerEval' : `PlayerEval-${branchPrefix}`;
    const table = new dynamodb.Table(this, 'Table', {
      tableName,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // === Lambda Function ===
    const appVersion = process.env.APP_VERSION || 'dev';
    const apiFunction = new lambda.Function(this, 'ApiFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'api.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        TABLE_NAME: tableName,
        BRANCH_PREFIX: branchPrefix,
        BYPASS_AUTH: isProduction ? 'false' : 'true',
        JWT_SECRET: isProduction
          ? cdk.Fn.ref('JWTSecret')
          : 'dev-secret-for-testing',
        BASE_URL: '', // Will be set after CloudFront is created
        NODE_ENV: isProduction ? 'production' : 'development',
        AWS_REGION_NAME: 'us-east-2',
        APP_VERSION: appVersion,
      },
    });

    // Grant DynamoDB access
    table.grantReadWriteData(apiFunction);

    // === API Gateway HTTP API ===
    const httpApi = new apigatewayv2.HttpApi(this, 'HttpApi', {
      apiName: `PlayerEval-${branchPrefix || 'prod'}`,
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.PUT,
          apigatewayv2.CorsHttpMethod.DELETE,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'Authorization', 'X-Test-User'],
      },
    });

    const integration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'ApiIntegration',
      apiFunction
    );

    httpApi.addRoutes({
      path: '/api/{proxy+}',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration,
    });

    // Also add root /api route
    httpApi.addRoutes({
      path: '/api',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration,
    });

    // === S3 Bucket for Frontend ===
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `player-eval-frontend-${branchPrefix || 'prod'}-${this.account}`,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProduction,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // === CloudFront Distribution ===
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI');
    websiteBucket.grantRead(originAccessIdentity);

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(websiteBucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(
            `${httpApi.httpApiId}.execute-api.${this.region}.amazonaws.com`
          ),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responsePagePath: '/index.html',
          responseHttpStatus: 200,
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 403,
          responsePagePath: '/index.html',
          responseHttpStatus: 200,
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    // Deploy frontend to S3
    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../frontend/dist'))],
      destinationBucket: websiteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // Update Lambda with the CloudFront URL
    const cfnFunction = apiFunction.node.defaultChild as lambda.CfnFunction;
    cfnFunction.addPropertyOverride(
      'Environment.Variables.BASE_URL',
      `https://${distribution.distributionDomainName}`
    );

    // === Outputs ===
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.url || '',
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront Distribution URL',
    });

    new cdk.CfnOutput(this, 'WebsiteBucketName', {
      value: websiteBucket.bucketName,
      description: 'S3 Bucket for frontend',
    });

    // Add JWT Secret parameter for production
    if (isProduction) {
      new cdk.CfnParameter(this, 'JWTSecret', {
        type: 'String',
        description: 'JWT signing secret for production',
        noEcho: true,
        default: 'change-me-in-production',
      });
    }
  }
}
