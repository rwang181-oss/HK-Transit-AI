declare namespace JSX {
  interface Element {}
  interface IntrinsicAttributes { key?: any }
  interface IntrinsicElements { [name: string]: any }
}

declare module 'react' {
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: any[]): T;
  export function useEffect(effect: any, deps?: any[]): void;
  export function useMemo<T>(factory: () => T, deps: any[]): T;
  export function useRef<T>(value: T): { current: T };
  export function useState<T>(value: T): [T, (value: T | ((previous: T) => T)) => void];
}
declare module 'react-native' {
  export type View = any;
  export const ActivityIndicator: any;
  export const Linking: any;
  export const Modal: any;
  export const Platform: any;
  export const Pressable: any;
  export const RefreshControl: any;
  export const SafeAreaView: any;
  export const ScrollView: any;
  export const StyleSheet: any;
  export const Text: any;
  export const TextInput: any;
  export const View: any;
}
declare module 'expo-router' {
  export const Stack: any;
  export const Tabs: any;
  export function useLocalSearchParams<T>(): T;
  export function useRouter(): any;
}
declare module 'expo-status-bar' { export const StatusBar: any; }
declare module 'expo-location' {
  export const Accuracy: any;
  export type LocationSubscription = any;
  export const requestForegroundPermissionsAsync: any;
  export const watchPositionAsync: any;
  export const getCurrentPositionAsync: any;
}
declare module '@react-native-async-storage/async-storage' { const value: any; export default value; }
declare module 'zustand' { export function create<T>(initializer: any): any; export function create<T>(): (initializer: any) => any; }
declare module 'zustand/middleware' { export const persist: any; export const createJSONStorage: any; }
declare module 'react-i18next' { export const useTranslation: any; export const initReactI18next: any; }
declare module 'i18next' { const value: any; export default value; }
declare module 'leaflet' { const value: any; export default value; }
declare module 'leaflet/dist/leaflet.css';
declare module 'expo-localization';
declare var require: any;
