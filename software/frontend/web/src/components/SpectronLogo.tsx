import React from 'react';
import { Box } from '@mui/material';

interface SpectronLogoProps {
  alt?: string;
  size?: number;
}

const SpectronLogo: React.FC<SpectronLogoProps> = ({ alt = 'SPECTRON', size = 40 }) => (
  <Box
    component="img"
    src={`${process.env.PUBLIC_URL || '.'}/assets/spectron-logo.svg`}
    alt={alt}
    sx={{
      width: size,
      height: size,
      display: 'block',
      flexShrink: 0,
      objectFit: 'contain',
    }}
  />
);

export default SpectronLogo;
