import React from 'react';
import { TextInput } from 'react-native';

export default function UpperTextInput({ onChangeText, value, ...props }) {
  return (
    <TextInput
      autoCapitalize="characters"
      {...props}
      value={value}
      onChangeText={t => onChangeText && onChangeText(t.toUpperCase())}
    />
  );
}
