import React, { useRef, useState, useImperativeHandle, forwardRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  Animated, Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');

// Ref global para chamar de qualquer tela
export const alertRef = React.createRef();

export function showToast(msg, type = 'error') {
  alertRef.current?.showToast(msg, type);
}

export function showConfirm({ titulo, mensagem, textoBotao = 'Confirmar', corBotao = '#2563eb', onConfirm, onCancel }) {
  alertRef.current?.showConfirm({ titulo, mensagem, textoBotao, corBotao, onConfirm, onCancel });
}

const AppAlert = forwardRef((_, ref) => {
  const [toast, setToast]       = useState(null);
  const [confirm, setConfirm]   = useState(null);
  const toastAnim               = useRef(new Animated.Value(0)).current;
  const timerRef                = useRef(null);

  useImperativeHandle(ref, () => ({
    showToast(msg, type = 'error') {
      if (timerRef.current) clearTimeout(timerRef.current);
      setToast({ msg, type });
      Animated.spring(toastAnim, { toValue: 1, useNativeDriver: true }).start();
      timerRef.current = setTimeout(() => {
        Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setToast(null));
      }, 3500);
    },
    showConfirm(opts) {
      setConfirm(opts);
    },
  }));

  const TOAST_COLORS = {
    error:   { bg: '#dc2626', icon: '✕' },
    success: { bg: '#16a34a', icon: '✓' },
    warning: { bg: '#d97706', icon: '!' },
    info:    { bg: '#2563eb', icon: 'i' },
  };

  return (
    <>
      {/* Toast */}
      {toast && (
        <Animated.View style={[
          s.toast,
          { backgroundColor: TOAST_COLORS[toast.type]?.bg || '#dc2626' },
          { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] },
        ]}>
          <View style={s.toastIcon}>
            <Text style={s.toastIconText}>{TOAST_COLORS[toast.type]?.icon}</Text>
          </View>
          <Text style={s.toastMsg}>{toast.msg}</Text>
          <TouchableOpacity onPress={() => setToast(null)} style={s.toastClose}>
            <Text style={s.toastCloseText}>✕</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Confirm */}
      <Modal visible={!!confirm} transparent animationType="slide" onRequestClose={() => { confirm?.onCancel?.(); setConfirm(null); }}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => { confirm?.onCancel?.(); setConfirm(null); }}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.confirmTitulo}>{confirm?.titulo}</Text>
            {!!confirm?.mensagem && <Text style={s.confirmMsg}>{confirm.mensagem}</Text>}
            <TouchableOpacity
              style={[s.confirmBtn, { backgroundColor: confirm?.corBotao || '#2563eb' }]}
              onPress={() => { confirm?.onConfirm?.(); setConfirm(null); }}>
              <Text style={s.confirmBtnText}>{confirm?.textoBotao || 'Confirmar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.cancelBtn}
              onPress={() => { confirm?.onCancel?.(); setConfirm(null); }}>
              <Text style={s.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
});

export default AppAlert;

const s = StyleSheet.create({
  toast: {
    position: 'absolute', top: 56, left: 16, right: 16,
    borderRadius: 14, flexDirection: 'row', alignItems: 'center',
    padding: 14, gap: 12, zIndex: 9999, elevation: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8,
  },
  toastIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  toastIconText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  toastMsg: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 20 },
  toastClose: { padding: 4 },
  toastCloseText: { color: 'rgba(255,255,255,0.7)', fontSize: 16 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  handle: { width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  confirmTitulo: { fontSize: 20, fontWeight: '800', color: '#1a1a2e', marginBottom: 8 },
  confirmMsg: { fontSize: 14, color: '#64748b', marginBottom: 24, lineHeight: 20 },
  confirmBtn: { borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 10 },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { backgroundColor: '#f1f5f9', borderRadius: 14, padding: 16, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '700', color: '#64748b' },
});
