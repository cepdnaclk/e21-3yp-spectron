import React from 'react';
import {
  Box,
  Card,
  CardContent,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';

type PageShellProps = {
  children: React.ReactNode;
  sx?: object;
};

export const PageShell: React.FC<PageShellProps> = ({ children, sx }) => (
  <Box
    sx={{
      position: 'relative',
      '&::before': {
        content: '""',
        position: 'absolute',
        inset: { xs: '8px 8px auto 8px', md: '14px 18px auto 18px' },
        height: { xs: 96, md: 128 },
        borderRadius: 4,
        background:
          'linear-gradient(90deg, rgba(235, 79, 18, 0.07), rgba(108, 137, 48, 0.08) 55%, rgba(51, 122, 133, 0.06))',
        pointerEvents: 'none',
        zIndex: 0,
      },
      ...sx,
    }}
  >
    <Box sx={{ position: 'relative', zIndex: 1 }}>{children}</Box>
  </Box>
);

type PageHeaderPanelProps = {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  info?: string;
  actions?: React.ReactNode;
};

export const PageHeaderPanel: React.FC<PageHeaderPanelProps> = ({ title, subtitle, icon, info, actions }) => (
  <Box
    sx={{
      mb: 3,
      p: { xs: 2, md: 2.5 },
      borderRadius: 4,
      border: '1px solid rgba(60, 57, 17, 0.1)',
      bgcolor: 'rgba(255, 253, 248, 0.9)',
      backdropFilter: 'blur(14px)',
      boxShadow: '0 16px 40px rgba(60, 57, 17, 0.08)',
    }}
  >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'center' }}
        spacing={2}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
        {icon && (
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'rgba(108, 137, 48, 0.12)',
              color: 'primary.main',
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <Typography variant="h4" sx={{ overflowWrap: 'anywhere' }}>
              {title}
            </Typography>
            {info && (
              <Tooltip title={info}>
                <IconButton size="small" aria-label={`${title} details`}>
                  <InfoOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
          {subtitle && (
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      </Stack>
      {actions && (
        <Box
          sx={{
            alignSelf: { xs: 'stretch', md: 'center' },
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {actions}
        </Box>
      )}
    </Stack>
  </Box>
);

type MetricCardProps = {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: string;
  children?: React.ReactNode;
};

export const MetricCard: React.FC<MetricCardProps> = ({ label, value, icon, tone = 'primary.main', children }) => (
  <Card
    variant="outlined"
    sx={{
      height: '100%',
      bgcolor: 'rgba(255,253,248,0.92)',
      borderColor: 'rgba(60, 57, 17, 0.1)',
      boxShadow: '0 10px 24px rgba(60, 57, 17, 0.06)',
    }}
  >
    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
      <Stack direction="row" spacing={1.25} alignItems="center">
        {icon && (
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'rgba(108, 137, 48, 0.12)',
              color: tone,
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h4" sx={{ lineHeight: 1 }}>
            {value}
          </Typography>
        </Box>
      </Stack>
      {children}
    </CardContent>
  </Card>
);

type EmptyStateCardProps = {
  icon?: React.ReactNode;
  title: string;
  action?: React.ReactNode;
};

export const EmptyStateCard: React.FC<EmptyStateCardProps> = ({ icon, title, action }) => (
  <Card
    variant="outlined"
    sx={{
      borderStyle: 'dashed',
      bgcolor: 'rgba(255,253,248,0.86)',
      boxShadow: '0 10px 24px rgba(60, 57, 17, 0.05)',
    }}
  >
    <CardContent sx={{ py: { xs: 6, md: 8 }, textAlign: 'center' }}>
      {icon && (
        <Box
          sx={{
            width: 72,
            height: 72,
            mx: 'auto',
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'rgba(108, 137, 48, 0.1)',
            color: 'primary.main',
          }}
        >
          {icon}
        </Box>
      )}
      <Typography variant="h6" sx={{ mt: icon ? 2 : 0 }}>
        {title}
      </Typography>
      {action && <Box sx={{ mt: 2.5 }}>{action}</Box>}
    </CardContent>
  </Card>
);
