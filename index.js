'use strict';

const _ = require('lodash');

class Plugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.hooks = {
      'before:deploy:createDeploymentArtifacts': this.createDeploymentArtifacts.bind(this),
    };
  }

  createDeploymentArtifacts() {
    if (!this.serverless.service.custom.autoscaling)
      return Promise.resolve();

    return Promise.resolve().then(() => {
      _.merge(
        this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        scalingRole(this.serverless.service.custom.autoscaling)
      );

      this.serverless.service.custom.autoscaling.forEach(
        (config) => {
          let resources = [];

          if (config.read) {
            resources.push(scalableTarget(config.table, config.read, 'Read'));
            resources.push(scalingPolicy(config.table, config.read, 'Read'));
          }

          if (config.write) {
            resources.push(scalableTarget(config.table, config.write, 'Write'));
            resources.push(scalingPolicy(config.table, config.write, 'Write'));
          }

          resources.forEach(
            (resource) => _.merge(
              this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              resource
            )
          );
        }
      );
    }).catch(
      err => this.serverless.cli.log(err.message)
    );
  }
}

module.exports = Plugin;

const scalableTarget = (table, capacity, dimension) => ({
  [`${table}AutoScalableTarget${dimension}`]: {
    Type: 'AWS::ApplicationAutoScaling::ScalableTarget',
    DependsOn: [
      table,
      'ScalingRole'
    ],
    Properties: {
      MinCapacity: capacity.minimum,
      MaxCapacity: capacity.maximum,
      ScheduledActions: (capacity.actions || []).map(action => ({
        ScalableTargetAction: {
          MinCapacity: action.minimum,
          MaxCapacity: action.maximum,
        },
        ScheduledActionName: action.name,
        Schedule: action.schedule
      })),
      ResourceId: {
        'Fn::Join': [
          '',
          [
            'table/',
            {
              'Ref': table
            }
          ]
        ]
      },
      RoleARN: {
        'Fn::GetAtt': [
          'ScalingRole',
          'Arn'
        ]
      },
      ScalableDimension: `dynamodb:table:${dimension}CapacityUnits`,
      ServiceNamespace: 'dynamodb'
    },
  },
});

const scalingPolicy = (table, capacity, dimension) => ({
  [`${table}AutoScalingPolicy${dimension}`]: {
    Type: 'AWS::ApplicationAutoScaling::ScalingPolicy',
    DependsOn: [
      table,
      `${table}AutoScalableTarget${dimension}`,
    ],
    Properties: {
      PolicyName: `${table}AutoScalingPolicy${dimension}`,
      PolicyType: 'TargetTrackingScaling',
      ScalingTargetId: {
        Ref: `${table}AutoScalableTarget${dimension}`,
      },
      TargetTrackingScalingPolicyConfiguration: {
        PredefinedMetricSpecification: {
          PredefinedMetricType: `DynamoDB${dimension}CapacityUtilization`
        },
        ScaleInCooldown: 60,
        ScaleOutCooldown: 60,
        TargetValue: capacity.usage * 100
      }
    },
  },
});

const scalingRole = (autoscaling) => ({
  ScalingRole: {
    Type: 'AWS::IAM::Role',
    DependsOn: autoscaling.map(config => config.table),
    Properties: {
      AssumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'application-autoscaling.amazonaws.com'
            }
          }
        ],
      },
      Policies: [
        {
          PolicyName: 'ScalingRolePolicy',
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Action: [
                  'cloudwatch:PutMetricAlarm',
                  'cloudwatch:DescribeAlarms',
                  'cloudwatch:DeleteAlarms',
                  'cloudwatch:GetMetricStatistics',
                  'cloudwatch:SetAlarmState'
                ],
                Effect: 'Allow',
                Resource: '*'
              },
              {
                Action: [
                  'dynamodb:DescribeTable',
                  'dynamodb:UpdateTable'
                ],
                Effect: 'Allow',
                Resource: autoscaling.map(config => ({
                  'Fn::Join': [
                    '',
                    [
                      'arn:aws:dynamodb:*:',
                      {
                        'Ref': 'AWS::AccountId'
                      },
                      ':table/',
                      {
                        'Ref': config.table
                      }
                    ]
                  ]
                })),
              }
            ],
          },
        }
      ],
    },
  }
});
