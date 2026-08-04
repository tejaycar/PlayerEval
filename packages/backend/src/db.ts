import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  BatchWriteCommand,
  UpdateCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-2' });
export const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'PlayerEval';

function pk(key: string): string {
  return key;
}

// === Generic operations ===

export async function putItem(item: Record<string, any>): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { ...item, PK: pk(item.PK) },
    })
  );
}

export async function getItem(PK: string, SK: string): Promise<any> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk(PK), SK },
    })
  );
  return result.Item;
}

export async function queryItems(
  PK: string,
  skPrefix?: string
): Promise<any[]> {
  const params: any = {
    TableName: TABLE_NAME,
    KeyConditionExpression: skPrefix
      ? 'PK = :pk AND begins_with(SK, :sk)'
      : 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': pk(PK),
      ...(skPrefix ? { ':sk': skPrefix } : {}),
    },
  };

  const result = await docClient.send(new QueryCommand(params));
  return result.Items || [];
}

export async function queryByGSI(
  indexName: string,
  keyName: string,
  keyValue: string,
  skPrefix?: string
): Promise<any[]> {
  const params: any = {
    TableName: TABLE_NAME,
    IndexName: indexName,
    KeyConditionExpression: skPrefix
      ? `${keyName} = :val AND begins_with(SK, :sk)`
      : `${keyName} = :val`,
    ExpressionAttributeValues: {
      ':val': keyValue,
      ...(skPrefix ? { ':sk': skPrefix } : {}),
    },
  };

  const result = await docClient.send(new QueryCommand(params));
  return result.Items || [];
}

export async function deleteItem(PK: string, SK: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk(PK), SK },
    })
  );
}

export async function batchPutItems(items: Record<string, any>[]): Promise<void> {
  // DynamoDB batch write limit is 25
  const batches = [];
  for (let i = 0; i < items.length; i += 25) {
    batches.push(items.slice(i, i + 25));
  }

  for (const batch of batches) {
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map((item) => ({
            PutRequest: {
              Item: { ...item, PK: pk(item.PK) },
            },
          })),
        },
      })
    );
  }
}

export async function updateItem(
  PK: string,
  SK: string,
  updates: Record<string, any>
): Promise<void> {
  const expressions: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, any> = {};

  Object.entries(updates).forEach(([key, value], i) => {
    expressions.push(`#f${i} = :v${i}`);
    names[`#f${i}`] = key;
    values[`:v${i}`] = value;
  });

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk(PK), SK },
      UpdateExpression: `SET ${expressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
}

export async function scanForTeamByName(teamName: string): Promise<string | null> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'SK = :sk',
      ExpressionAttributeValues: { ':sk': 'META' },
    })
  );
  const items = result.Items || [];
  // Find team by name (case-insensitive)
  const match = items.find(
    (i) => i.PK?.startsWith('TEAM#') && (i.name as string || '').toLowerCase() === teamName.toLowerCase()
  );
  return match ? (match.id as string) : null;
}