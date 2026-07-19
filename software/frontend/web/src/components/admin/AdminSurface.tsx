import React from 'react';
import { Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material';

export const adminCardSx = {
  border: '1px solid rgba(60,57,17,0.08)',
  bgcolor: 'rgba(255,253,248,0.92)',
  boxShadow: '0 12px 28px rgba(60,57,17,0.06)',
};

export const compactAdminButtonSx = {
  minHeight: 36,
  px: 1.5,
  py: 0.5,
  borderRadius: 2,
  transition: 'transform 160ms ease, background-color 160ms ease, border-color 160ms ease',
  '&:hover': {
    transform: 'translateY(-1px)',
  },
  '&:active': {
    transform: 'translateY(0)',
  },
};

type AdminPageShellProps = {
  title: string;
  subtitle: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export const AdminPageShell: React.FC<AdminPageShellProps> = ({ title, subtitle, eyebrow, actions, children }) => (
  <Box
    sx={{
      position: 'relative',
      '&::before': {
        content: '""',
        position: 'absolute',
        inset: { xs: '-8px -8px auto -8px', md: '-16px -16px auto -16px' },
        height: { xs: 138, md: 164 },
        borderRadius: 4,
        background:
          'linear-gradient(90deg, rgba(235,79,18,0.08), rgba(108,137,48,0.1) 52%, rgba(51,122,133,0.07))',
        pointerEvents: 'none',
        zIndex: 0,
      },
    }}
  >
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'stretch', md: 'center' }}
      spacing={2}
      sx={{
        mb: 2.5,
        p: { xs: 2, md: 2.5 },
        borderRadius: 4,
        ...adminCardSx,
        position: 'relative',
        zIndex: 1,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        {eyebrow && (
          <Chip size="small" color="primary" variant="outlined" label={eyebrow} sx={{ mb: 1 }} />
        )}
        <Typography variant="h4" sx={{ overflowWrap: 'anywhere' }}>
          {title}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: 760 }}>
          {subtitle}
        </Typography>
      </Box>
      {actions && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="stretch" sx={{ flexShrink: 0 }}>
          {actions}
        </Stack>
      )}
    </Stack>
    <Box sx={{ position: 'relative', zIndex: 1 }}>{children}</Box>
  </Box>
);

type AdminStatCardProps = {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone?: string;
  color?: string;
};

export const AdminStatCard: React.FC<AdminStatCardProps> = ({
  label,
  value,
  icon,
  tone = '#fffaf4',
  color = '#6c8930',
}) => (
  <Card sx={{ height: '100%', ...adminCardSx, bgcolor: tone }}>
    <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
      <Stack direction="row" spacing={1.25} alignItems="center">
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'rgba(255,255,255,0.72)',
            color,
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h5" sx={{ lineHeight: 1, overflowWrap: 'anywhere' }}>
            {value}
          </Typography>
        </Box>
      </Stack>
    </CardContent>
  </Card>
);
