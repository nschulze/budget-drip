'use strict';

const AWS = require('aws-sdk'); // eslint-disable-line import/no-extraneous-dependencies
const dynamoDb = new AWS.DynamoDB.DocumentClient();

module.exports.getInstitutions = () => {
  let params = {
    TableName : process.env.DYNAMODB_TABLE
  };

  return dynamoDb.scan(params).promise();
};

module.exports.addInstitution = (institution_id, access_token, name) => {
  const params = {
    TableName: process.env.DYNAMODB_TABLE,
    Key: {
      institutionId: institution_id

    },
    ExpressionAttributeValues: {
      ':accessToken': access_token,
      ':institutionName': name
    },
    UpdateExpression: 'SET accessToken = :accessToken, institutionName = :institutionName',
    ReturnValues: 'UPDATED_NEW',
  };

  return dynamoDb.update(params).promise();
};