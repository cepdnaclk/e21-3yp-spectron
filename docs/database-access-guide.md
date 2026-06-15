# Database Access Guide

This guide documents how to access the Spectron production database (AWS RDS) from an EC2 instance, and how to execute basic commands like upgrading user roles.

## Prerequisites

To connect to the database, you must first connect to an EC2 instance that resides in the same AWS VPC as the database, as the RDS instance is not publicly accessible.

**1. Locate your PEM key:**
You need your SSH private key (e.g., `spectron-kafka-key.pem`).
If you are on Windows, ensure the file permissions are restricted, otherwise SSH will reject it:
```powershell
icacls "C:\Users\dell\Downloads\spectron-kafka-key.pem" /inheritance:r /grant:r "$($env:USERNAME):(R)"
```

**2. Ensure the EC2 Security Group allows SSH:**
- Go to AWS Console → **EC2** → **Security Groups**.
- Find the security group attached to your instance.
- Ensure there is an **Inbound Rule** for **SSH (Port 22)** with the Source set to **Anywhere-IPv4** (`0.0.0.0/0`) or your specific IP.

## Step 1: SSH into the Bastion / EC2 Instance

Connect to your EC2 instance (e.g., the Kafka server) using your terminal:

```bash
ssh -i "C:\Users\dell\Downloads\spectron-kafka-key.pem" ec2-user@35.154.42.101
```

*(If you are connecting to an Elastic Beanstalk instance, the username might be `ec2-user` or `ubuntu` depending on the AMI).*

## Step 2: Retrieve Database Credentials

The backend connects to the database using environment variables stored in AWS Elastic Beanstalk. To find them:
1. Go to AWS Console → **Elastic Beanstalk** → **Environments**.
2. Select `Spectron-backend-env` → **Configuration**.
3. Under **Updates, monitoring, and routing** (or Software), click **Edit**.
4. Scroll down to **Environment properties**. Here you will find:
   - `DB_NAME` (e.g., `postgres`)
   - `DB_USER` (e.g., `spectronadmin`)
   - `DB_PASSWORD`
   - The RDS Endpoint URL

## Step 3: Connect via psql

Once inside the EC2 SSH session, use the PostgreSQL client (`psql`) to connect to the RDS instance. 

*If `psql` is not installed, run: `sudo yum install -y postgresql15`*

Connect using the exact connection string format. RDS requires SSL, so we append `sslmode=require`:

```bash
psql "host=database-1.cd6qac0espkd.ap-south-1.rds.amazonaws.com user=spectronadmin dbname=postgres sslmode=require"
```
When prompted, paste the `DB_PASSWORD` you retrieved from Elastic Beanstalk.

## Example: Upgrading a User to OWNER

If a user gets a `403 Forbidden` error when trying to configure sensors, it means they are currently a `VIEWER` or `MEMBER`. You can upgrade them to `OWNER` using this SQL command:

```sql
-- Replace the email with the actual user's email
UPDATE account_memberships
SET role = 'OWNER'
WHERE user_id = (SELECT id FROM users WHERE email = 'user@example.com');
```

Verify the change:
```sql
SELECT u.email, am.role 
FROM users u
JOIN account_memberships am ON am.user_id = u.id
WHERE u.email = 'user@example.com';
```

## Troubleshooting

- **`Permission denied (publickey)`**: The EC2 server does not recognize your PEM file. Verify you are connecting to the correct IP address and that the instance's "Key pair name" matches your PEM file.
- **`Connection timed out`**: Port 22 is blocked. Check your AWS Security Groups.
- **`Name or service not known`**: You are likely trying to run `psql` from your local computer instead of from inside the SSH session. The RDS internal DNS name can only be resolved from inside the AWS VPC.
- **`FATAL: password authentication failed`**: You are using the wrong database username or password. Check Elastic Beanstalk for the exact credentials.
