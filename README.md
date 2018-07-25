# serverless-dynamodb-autoscaling-plugin

This plugin addes autoscaling and scheduled actions to DynamoDB tables.

## Install plugin:

```
npm install --save-dev serverless-dynamodb-autoscaling-plugin
```

## serverless.yml:

```
plugins:
  - serverless-dynamodb-autoscaling-plugin

custom:
  autoscaling:
    - table: Table
      read:
        minimum: 5
        maximum: 20
        usage: 0.6
        actions:
          - name: morning
            minimum: 5
            maximum: 20
            schedule: cron(0 6 * * ? *)
          - name: night
            minimum: 1
            maximum: 1
            schedule: cron(0 0 * * ? *)
      write:
        minimum: 5
        maximum: 50
        usage: 0.6
        actions:
          - name: morning
            minimum: 5
            maximum: 50
            schedule: cron(0 6 * * ? *)
          - name: night
            minimum: 1
            maximum: 1
            schedule: cron(0 0 * * ? *)

resources:
  Resources:
    Table:
      Type: AWS::DynamoDB::Table
      ...
```

